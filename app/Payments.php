<?php
declare(strict_types=1);

/**
 * Оплата через ЮKassa (API v3).
 * Настройки в app/config.php:
 *   'yookassa' => ['shop_id' => '...', 'secret_key' => '...', 'receipt' => true, 'vat_code' => 1]
 * receipt — передавать чек по 54-ФЗ (нужно, если в ЮKassa подключены чеки). vat_code 1 = без НДС.
 * Уведомления: в личном кабинете ЮKassa → Интеграция → HTTP-уведомления укажите
 *   https://ВАШ-ДОМЕН/api/payments/webhook  (события payment.succeeded и payment.canceled).
 * Статус платежа сайт всегда перепроверяет запросом к API — подделать уведомление нельзя.
 */
final class Payments
{
    private const API = 'https://api.yookassa.ru/v3';

    private static function cfg(): array
    {
        return (array) config('yookassa', []);
    }

    public static function enabled(): bool
    {
        $c = self::cfg();
        return !empty($c['shop_id']) && !empty($c['secret_key']);
    }

    /** Создаёт платёж и возвращает [id, ссылка на оплату]. */
    public static function create(array $order, string $returnUrl): array
    {
        $c = self::cfg();
        $amount = number_format($order['amount'], 2, '.', '');
        $body = [
            'amount' => ['value' => $amount, 'currency' => 'RUB'],
            'capture' => true,
            'confirmation' => ['type' => 'redirect', 'return_url' => $returnUrl],
            'description' => mb_substr('Заказ №' . $order['number'] . ' — персональная книга Книгигай', 0, 128),
            'metadata' => ['order' => $order['token']],
        ];
        if (!empty($c['receipt'])) {
            $unit = number_format($order['amount'] / max(1, $order['qty']), 2, '.', '');
            $body['receipt'] = [
                'customer' => array_filter([
                    'full_name' => $order['customer']['name'] ?? null,
                    'email' => $order['customer']['email'] ?? null,
                    'phone' => $order['customer']['phone'] ?? null,
                ]),
                'items' => [[
                    'description' => 'Персональная книга в твёрдом переплёте',
                    'quantity' => (string) $order['qty'],
                    'amount' => ['value' => $unit, 'currency' => 'RUB'],
                    'vat_code' => (int) ($c['vat_code'] ?? 1),
                    'payment_mode' => 'full_prepayment',
                    'payment_subject' => 'commodity',
                ]],
            ];
        }
        $p = self::call('POST', '/payments', $body, $order['token'] . '-' . bin2hex(random_bytes(4)));
        $url = $p['confirmation']['confirmation_url'] ?? null;
        if (empty($p['id']) || !$url) {
            throw new HttpError(502, 'Платёжный сервис не вернул ссылку на оплату. Попробуйте ещё раз.');
        }
        return [$p['id'], $url];
    }

    public static function fetch(string $id): array
    {
        if (!preg_match('/^[a-zA-Z0-9\-_]{10,64}$/', $id)) {
            throw new HttpError(422, 'Некорректный платёж');
        }
        return self::call('GET', '/payments/' . $id);
    }

    private static function call(string $method, string $path, ?array $body = null, ?string $idem = null): array
    {
        $c = self::cfg();
        $ch = curl_init(self::API . $path);
        $headers = ['Content-Type: application/json'];
        if ($idem) {
            $headers[] = 'Idempotence-Key: ' . $idem;
        }
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 25,
            CURLOPT_USERPWD => $c['shop_id'] . ':' . $c['secret_key'],
            CURLOPT_HTTPHEADER => $headers,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
        }
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            error_log('[yookassa] ' . $err);
            throw new HttpError(502, 'Не удалось связаться с ЮKassa. Попробуйте через минуту.');
        }
        $data = json_decode((string) $raw, true) ?: [];
        if ($code >= 300) {
            error_log('[yookassa] ' . $code . ' ' . $raw);
            throw new HttpError(502, 'ЮKassa отклонила запрос: ' . ($data['description'] ?? ('код ' . $code)));
        }
        return $data;
    }
}
