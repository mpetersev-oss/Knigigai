<?php
declare(strict_types=1);

/**
 * Заказы. Заказ хранит «снимок» книги на момент оформления — именно он идёт в печать.
 * Статусы: new (создан, оплата не подключена или ещё не начата), pending (ждём оплату),
 * paid (оплачен), canceled (оплата отменена), printing, shipped, done.
 */
final class Orders
{
    public const STATUSES = [
        'new' => 'Новый', 'pending' => 'Ждёт оплаты', 'paid' => 'Оплачен', 'canceled' => 'Оплата отменена',
        'printing' => 'В печати', 'shipped' => 'Отправлен', 'done' => 'Доставлен',
    ];
    public const DELIVERY = ['courier' => 'Курьером до двери', 'pickup' => 'В пункт выдачи'];

    public static function create(string $bookToken, array $in): array
    {
        $book = Books::find($bookToken);
        if ($book['status'] !== 'draft') {
            throw new HttpError(409, 'Эта книга уже заказана.');
        }
        if ($why = Books::readiness($book['data'])) {
            throw new HttpError(422, $why);
        }
        $customer = self::cleanCustomer($in);
        $qty = max(1, min(10, (int) ($in['qty'] ?? 1)));
        $amount = (int) config('price_rub', 4900) * $qty;
        $token = self::newToken();
        $now = Db::now();
        $pdo = Db::pdo();
        $pdo->prepare('INSERT INTO orders (token, book_token, status, qty, amount, customer, snapshot, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
            ->execute([$token, $bookToken, 'new', $qty, $amount, json_encode($customer, JSON_UNESCAPED_UNICODE), json_encode($book['data'], JSON_UNESCAPED_UNICODE), $now, $now]);
        if ($customer['email'] && !$book['email']) {
            $pdo->prepare('UPDATE books SET email = ? WHERE token = ?')->execute([$customer['email'], $bookToken]);
        }
        $order = self::find($token, false);

        if (!Payments::enabled()) {
            Books::setStatus($bookToken, 'ordered'); // заказ принят — книга больше не меняется
            // Онлайн-оплата ещё не подключена: заказ принят, менеджер свяжется для оплаты
            self::notify($order, 'Новый заказ (оплата не подключена)');
            Mail::send($customer['email'], 'Заказ №' . $order['number'] . ' принят', self::customerText($order, false));
            return ['order' => $order, 'payUrl' => null];
        }
        return ['order' => self::find($token, false), 'payUrl' => self::startPayment($token)];
    }

    /** Новый платёж по заказу (в том числе повторно, если прошлый отменён). */
    public static function startPayment(string $token): string
    {
        $order = self::find($token, true);
        if (in_array($order['status'], ['paid', 'printing', 'shipped', 'done'], true)) {
            throw new HttpError(409, 'Заказ уже оплачен');
        }
        if (!Payments::enabled()) {
            throw new HttpError(409, 'Онлайн-оплата пока не подключена — мы свяжемся с вами.');
        }
        $row = self::row($token);
        [$pid, $url] = Payments::create($order + ['customer' => json_decode($row['customer'], true)], self::baseUrl() . '/order/' . $token);
        Db::pdo()->prepare('UPDATE orders SET payment_id = ?, status = ?, updated_at = ? WHERE token = ?')
            ->execute([$pid, 'pending', Db::now(), $token]);
        return $url;
    }

    /** Заказ для покупателя. $sync — перепроверить платёж в ЮKassa, если он ещё не завершён. */
    public static function find(string $token, bool $sync = true): array
    {
        $row = self::row($token);
        if ($sync && $row['status'] === 'pending' && $row['payment_id'] && Payments::enabled()) {
            try {
                self::applyPayment(Payments::fetch($row['payment_id']));
                $row = self::row($token);
            } catch (Throwable $e) {
                error_log('[orders] sync: ' . $e->getMessage());
            }
        }
        return self::present($row);
    }

    /** Применяет статус платежа (из уведомления или проверки). */
    public static function applyPayment(array $p): void
    {
        $id = (string) ($p['id'] ?? '');
        $st = Db::pdo()->prepare('SELECT * FROM orders WHERE payment_id = ?');
        $st->execute([$id]);
        $row = $st->fetch();
        if (!$row) {
            return;
        }
        $status = $p['status'] ?? '';
        $paidAmount = (int) round((float) ($p['amount']['value'] ?? 0));
        if ($status === 'succeeded' && !empty($p['paid']) && $paidAmount >= (int) $row['amount'] && $row['status'] !== 'paid' && in_array($row['status'], ['new', 'pending', 'canceled'], true)) {
            $now = Db::now();
            // В печать идёт книга в том виде, в каком она была в момент оплаты
            try {
                $book = Books::find($row['book_token']);
                if ($book['status'] === 'draft' && !Books::readiness($book['data'])) {
                    Db::pdo()->prepare('UPDATE orders SET snapshot = ? WHERE id = ?')->execute([json_encode($book['data'], JSON_UNESCAPED_UNICODE), $row['id']]);
                }
            } catch (Throwable $e) {
                error_log('[orders] snapshot: ' . $e->getMessage());
            }
            Db::pdo()->prepare('UPDATE orders SET status = ?, paid_at = ?, updated_at = ? WHERE id = ?')->execute(['paid', $now, $now, $row['id']]);
            Books::setStatus($row['book_token'], 'paid');
            $order = self::present(self::row($row['token']));
            self::notify($order, 'Оплачен заказ');
            $c = json_decode($row['customer'], true);
            Mail::send($c['email'] ?? '', 'Заказ №' . $order['number'] . ' оплачен', self::customerText($order, true));
        } elseif ($status === 'canceled' && $row['status'] === 'pending') {
            Db::pdo()->prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?')->execute(['canceled', Db::now(), $row['id']]);
        }
    }

    public static function setStatus(string $token, string $status): void
    {
        if (!isset(self::STATUSES[$status])) {
            throw new HttpError(422, 'Неизвестный статус');
        }
        $row = self::row($token);
        Db::pdo()->prepare('UPDATE orders SET status = ?, updated_at = ?' . ($status === 'paid' && !$row['paid_at'] ? ', paid_at = updated_at' : '') . ' WHERE token = ?')
            ->execute([$status, Db::now(), $token]);
        if (in_array($status, ['paid', 'printing', 'shipped', 'done'], true)) {
            Books::setStatus($row['book_token'], 'paid');
        }
    }

    /** Для админки: все заказы с данными покупателя. */
    public static function latest(int $limit = 200): array
    {
        $st = Db::pdo()->query('SELECT * FROM orders ORDER BY id DESC LIMIT ' . max(1, min(500, $limit)));
        return array_map(fn ($r) => self::present($r) + ['customer' => json_decode($r['customer'], true), 'paymentId' => $r['payment_id']], $st->fetchAll());
    }

    /** Снимок книги для печати (по токену заказа). */
    public static function snapshot(string $token): array
    {
        $row = self::row($token);
        return ['order' => self::present($row), 'data' => json_decode($row['snapshot'], true)];
    }

    private static function row(string $token): array
    {
        if (!preg_match('/^[a-zA-Z0-9]{16,40}$/', $token)) {
            throw new HttpError(404, 'Заказ не найден');
        }
        $st = Db::pdo()->prepare('SELECT * FROM orders WHERE token = ?');
        $st->execute([$token]);
        $row = $st->fetch();
        if (!$row) {
            throw new HttpError(404, 'Заказ не найден');
        }
        return $row;
    }

    private static function present(array $r): array
    {
        $c = json_decode($r['customer'], true) ?: [];
        return [
            'token' => $r['token'],
            'number' => 1000 + (int) $r['id'],
            'book' => $r['book_token'],
            'status' => $r['status'],
            'statusLabel' => self::STATUSES[$r['status']] ?? $r['status'],
            'qty' => (int) $r['qty'],
            'amount' => (int) $r['amount'],
            'name' => $c['name'] ?? '',
            'email' => $c['email'] ?? '',
            'delivery' => self::DELIVERY[$c['delivery'] ?? 'courier'] ?? '',
            'createdAt' => $r['created_at'],
            'paidAt' => $r['paid_at'],
            'payOnline' => Payments::enabled(),
        ];
    }

    private static function cleanCustomer(array $in): array
    {
        $s = fn ($k, $max = 200) => mb_substr(trim(preg_replace('/\s+/u', ' ', (string) ($in[$k] ?? ''))), 0, $max);
        $c = [
            'name' => $s('name', 80),
            'phone' => $s('phone', 30),
            'email' => $s('email', 120),
            'city' => $s('city', 80),
            'address' => $s('address', 250),
            'zip' => $s('zip', 12),
            'delivery' => isset(self::DELIVERY[$in['delivery'] ?? '']) ? $in['delivery'] : 'courier',
            'comment' => $s('comment', 500),
        ];
        if (mb_strlen($c['name']) < 2) {
            throw new HttpError(422, 'Укажите имя и фамилию получателя');
        }
        if (strlen(preg_replace('/\D/', '', $c['phone'])) < 10) {
            throw new HttpError(422, 'Проверьте номер телефона');
        }
        if (!filter_var($c['email'], FILTER_VALIDATE_EMAIL)) {
            throw new HttpError(422, 'Проверьте адрес почты — на него придёт чек и номер заказа');
        }
        if ($c['city'] === '') {
            throw new HttpError(422, 'Укажите город');
        }
        if (mb_strlen($c['address']) < 5) {
            throw new HttpError(422, $c['delivery'] === 'pickup' ? 'Укажите адрес пункта выдачи' : 'Укажите адрес доставки: улица, дом, квартира');
        }
        return $c;
    }

    public static function baseUrl(): string
    {
        $b = rtrim((string) config('base_url', ''), '/');
        if ($b !== '') {
            return $b;
        }
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
        return ($https ? 'https' : 'http') . '://' . preg_replace('/[^a-zA-Z0-9.\-:]/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'localhost'));
    }

    private static function notify(array $order, string $title): void
    {
        $to = (string) config('notify_email', '');
        if ($to === '') {
            return;
        }
        $row = self::row($order['token']);
        $c = json_decode($row['customer'], true);
        $lines = [
            $title . ' №' . $order['number'],
            'Сумма: ' . $order['amount'] . ' ₽, экземпляров: ' . $order['qty'],
            'Покупатель: ' . $c['name'] . ', ' . $c['phone'] . ', ' . $c['email'],
            'Доставка: ' . (self::DELIVERY[$c['delivery']] ?? '') . ' — ' . $c['zip'] . ' ' . $c['city'] . ', ' . $c['address'],
            $c['comment'] ? 'Комментарий: ' . $c['comment'] : '',
            '',
            'Админка: ' . self::baseUrl() . '/admin',
        ];
        Mail::send($to, $title . ' №' . $order['number'], implode("\n", array_filter($lines, fn ($l) => $l !== null)));
    }

    private static function customerText(array $order, bool $paid): string
    {
        $url = self::baseUrl() . '/order/' . $order['token'];
        return implode("\n", [
            'Здравствуйте, ' . $order['name'] . '!',
            '',
            $paid
                ? 'Спасибо! Заказ №' . $order['number'] . ' оплачен. Мы проверим макет и передадим книгу в печать — обычно доставка занимает около 5 рабочих дней.'
                : 'Мы получили заказ №' . $order['number'] . ' на ' . $order['amount'] . ' ₽. Скоро свяжемся с вами, чтобы подтвердить его и договориться об оплате.',
            '',
            'Статус заказа: ' . $url,
            '',
            'Книгигай',
        ]);
    }

    private static function newToken(): string
    {
        $alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $t = '';
        for ($i = 0; $i < 22; $i++) {
            $t .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        return $t;
    }
}
