<?php
declare(strict_types=1);

final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            $c = config('db');
            self::$pdo = new PDO($c['dsn'], $c['user'] ?? null, $c['pass'] ?? null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            self::migrate(self::$pdo);
        }
        return self::$pdo;
    }

    public static function isSqlite(): bool
    {
        return self::pdo()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';
    }

    /** Создаёт таблицы при первом запуске. Изменения схемы — новыми версиями ниже. */
    private static function migrate(PDO $pdo): void
    {
        $sqlite = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';
        $id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
        $text = $sqlite ? 'TEXT' : 'MEDIUMTEXT';
        $tail = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';

        $pdo->exec("CREATE TABLE IF NOT EXISTS kg_meta (k VARCHAR(64) PRIMARY KEY, v VARCHAR(255) NOT NULL)$tail");
        $ver = (int) ($pdo->query("SELECT v FROM kg_meta WHERE k='schema'")->fetchColumn() ?: 0);

        if ($ver < 1) {
            $pdo->exec("CREATE TABLE IF NOT EXISTS books (
                id $id,
                token VARCHAR(40) NOT NULL UNIQUE,
                data $text NOT NULL,
                email VARCHAR(190) NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'draft',
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )$tail");
            $pdo->exec("CREATE TABLE IF NOT EXISTS assets (
                akey VARCHAR(190) NOT NULL PRIMARY KEY,
                file VARCHAR(190) NOT NULL,
                fw INT NOT NULL, fh INT NOT NULL,
                x INT NOT NULL, y INT NOT NULL, w INT NOT NULL, h INT NOT NULL,
                src VARCHAR(190) NOT NULL DEFAULT '',
                updated_at DATETIME NOT NULL
            )$tail");
            self::setMeta($pdo, 'schema', '1');
        }
    }

    private static function setMeta(PDO $pdo, string $k, string $v): void
    {
        $pdo->prepare('DELETE FROM kg_meta WHERE k = ?')->execute([$k]);
        $pdo->prepare('INSERT INTO kg_meta (k, v) VALUES (?, ?)')->execute([$k, $v]);
    }

    public static function now(): string
    {
        return date('Y-m-d H:i:s');
    }
}
