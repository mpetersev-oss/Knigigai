<?php
// Скопируйте этот файл в app/config.php и заполните значения.
// app/config.php не попадает в git.
return [
    // Публичный адрес сайта без слеша в конце (пока нет домена — технический адрес Beget)
    'base_url' => 'https://knigigai.beget.tech',

    // База данных. На Beget: раздел «MySQL» в панели управления.
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
];
