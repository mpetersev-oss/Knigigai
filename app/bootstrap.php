<?php
declare(strict_types=1);

const APP_ROOT = __DIR__ . '/..';
const STORAGE_DIR = APP_ROOT . '/storage';
const MEDIA_DIR = APP_ROOT . '/public_html/media';
const MEDIA_URL = '/media';

mb_internal_encoding('UTF-8');
date_default_timezone_set('Europe/Moscow');

function config(?string $key = null, $default = null)
{
    static $cfg = null;
    if ($cfg === null) {
        $file = __DIR__ . '/config.php';
        if (!is_file($file)) {
            $file = __DIR__ . '/config.example.php';
        }
        $cfg = require $file;
        // Переменные окружения переопределяют конфиг (удобно для локальной разработки)
        if ($dsn = getenv('KG_DB_DSN')) {
            $cfg['db'] = ['dsn' => $dsn, 'user' => getenv('KG_DB_USER') ?: null, 'pass' => getenv('KG_DB_PASS') ?: null];
        }
        if ($hash = getenv('KG_ADMIN_HASH')) {
            $cfg['admin_password_hash'] = $hash;
        }
    }
    if ($key === null) {
        return $cfg;
    }
    return $cfg[$key] ?? $default;
}

spl_autoload_register(function (string $class): void {
    $file = __DIR__ . '/' . str_replace('\\', '/', $class) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

set_exception_handler(function (Throwable $e): void {
    error_log('[knigigai] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        http_response_code($e instanceof HttpError ? $e->status : 500);
        header('Content-Type: application/json; charset=utf-8');
    }
    $msg = $e instanceof HttpError ? $e->getMessage() : 'Внутренняя ошибка сервера. Попробуйте ещё раз.';
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
});
