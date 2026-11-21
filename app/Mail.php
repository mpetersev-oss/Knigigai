<?php
declare(strict_types=1);

/** Простые текстовые письма через mail() хостинга. Ошибки отправки не ломают заказ. */
final class Mail
{
    public static function send(string $to, string $subject, string $text): void
    {
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            return;
        }
        $host = preg_replace('/^www\./', '', (string) parse_url(Orders::baseUrl(), PHP_URL_HOST));
        $from = (string) config('mail_from', '') ?: ('noreply@' . ($host ?: 'localhost'));
        $headers = [
            'From: =?UTF-8?B?' . base64_encode('Книгигай') . '?= <' . $from . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
        ];
        $reply = (string) config('contact_email', '');
        if (filter_var($reply, FILTER_VALIDATE_EMAIL)) {
            $headers[] = 'Reply-To: ' . $reply;
        }
        try {
            @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $text, implode("\r\n", $headers));
        } catch (Throwable $e) {
            error_log('[mail] ' . $e->getMessage());
        }
    }
}
