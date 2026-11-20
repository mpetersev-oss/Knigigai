<?php
// Локальный запуск: php -S localhost:8080 -t public_html dev/router.php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path !== '/' && is_file(__DIR__ . '/../public_html' . $path)) {
    return false;
}
require __DIR__ . '/../public_html/index.php';
