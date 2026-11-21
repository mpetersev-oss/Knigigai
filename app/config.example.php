<?php
// Скопируйте этот файл в app/config.php и заполните значения.
// app/config.php не попадает в git.
return [
    // Публичный адрес сайта без слеша в конце (пока нет домена — технический адрес хостинга)
    'base_url' => '',

    // База данных. На Timeweb: «Базы данных MySQL», пользователь = имя базы.
    // Для локальной разработки можно использовать SQLite: 'dsn' => 'sqlite:' . __DIR__ . '/../storage/dev.sqlite'
    'db' => [
        'dsn'  => 'mysql:host=localhost;dbname=ИМЯ_БАЗЫ;charset=utf8mb4',
        'user' => 'ИМЯ_ПОЛЬЗОВАТЕЛЯ',
        'pass' => 'ПАРОЛЬ',
    ],

    // Пароль от админки /admin. Сгенерировать хеш:
    // php -r "echo password_hash('ваш-пароль', PASSWORD_DEFAULT), PHP_EOL;"
    'admin_password_hash' => '',

    // Airtable: персональный токен (https://airtable.com/create/tokens) с доступом
    // data.records:read к базе «Lovebooks (Update)». Нужен только для синхронизации поз.
    'airtable_token' => '',

    // Цена книги в рублях (показывается на сайте)
    'price_rub' => 4900,

    // Почта для связи (в подвале сайта и в ответах на письма) и куда присылать уведомления о заказах
    'contact_email' => '',
    'notify_email' => '',
    // Адрес отправителя писем (по умолчанию noreply@ваш-домен)
    'mail_from' => '',

    // ЮKassa: личный кабинет → Интеграция → Ключи API. Пока пусто — заказы принимаются без онлайн-оплаты.
    // HTTP-уведомления: https://ВАШ-ДОМЕН/api/payments/webhook (payment.succeeded, payment.canceled)
    'yookassa' => [
        'shop_id' => '',
        'secret_key' => '',
        'receipt' => true,   // отправлять чек по 54-ФЗ (если в ЮKassa подключены чеки)
        'vat_code' => 1,     // 1 — без НДС
    ],
];
