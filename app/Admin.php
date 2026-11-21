<?php
declare(strict_types=1);

/**
 * Админка: вход по паролю и синхронизация картинок.
 *
 * Синхронизация выполняется в браузере администратора: страница /admin скачивает
 * каждую SVG через прокси этого сервера, рисует её на canvas (браузер корректно
 * отображает любые SVG), обрезает пустые поля, сжимает в WebP и отправляет сюда.
 * Так не нужны тяжёлые библиотеки на хостинге и нет упора в лимит времени PHP.
 */
final class Admin
{
    private const PROXY_HOSTS = ['cdn.prod.website-files.com', 'uploads-ssl.webflow.com', 'v5.airtableusercontent.com', 'dl.airtable.com'];

    public static function startSession(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_name('kgadm');
            session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict', 'secure' => !empty($_SERVER['HTTPS'])]);
            session_start();
        }
    }

    public static function isLogged(): bool
    {
        self::startSession();
        return !empty($_SESSION['admin']);
    }

    public static function require(): void
    {
        if (!self::isLogged()) {
            throw new HttpError(401, 'Нужно войти в админку');
        }
        if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'kg') {
            throw new HttpError(403, 'Запрос отклонён');
        }
    }

    public static function login(string $password): bool
    {
        self::startSession();
        $hash = (string) config('admin_password_hash', '');
        if ($hash === '') {
            throw new HttpError(500, 'Пароль админки не задан в app/config.php');
        }
        usleep(300000);
        if (password_verify($password, $hash)) {
            session_regenerate_id(true);
            $_SESSION['admin'] = true;
            return true;
        }
        return false;
    }

    public static function logout(): void
    {
        self::startSession();
        $_SESSION = [];
        session_destroy();
    }

    /**
     * План синхронизации: список задач {key, src, cover}.
     * $scope: editor | covers | poses ; $poseNums — какие позы (для poses).
     */
    public static function plan(string $scope, array $poseNums, bool $onlyMissing): array
    {
        $src = Catalog::source();
        $have = [];
        if ($onlyMissing) {
            foreach (Db::pdo()->query('SELECT akey, src FROM assets') as $r) {
                // Губы редактора раньше брались из Webflow (неверный масштаб) — такие перезагружаем
                if (str_starts_with($r['akey'], 'e:mouth-') && !str_contains((string) $r['src'], 'airtable')) {
                    continue;
                }
                $have[$r['akey']] = true;
            }
        }
        $jobs = [];
        $add = function (string $key, ?string $url, bool $cover = false) use (&$jobs, $have): void {
            if ($url && !isset($have[$key])) {
                $jobs[] = ['key' => $key, 'src' => $url, 'cover' => $cover];
            }
        };

        if ($scope === 'editor') {
            foreach ($src['tones'] as $t) {
                $add('e:body-' . $t['key'], $t['body']);
            }
            foreach (($src['underwear'] ?? []) as $k => $u) {
                $add('e:underwear-' . $k, $u);
            }
            // Губы — из Airtable, из позы, голова которой совпадает с редактором
            $mouths = [];
            $mouthPose = (int) ($src['editorMouthFromPose'] ?? 1);
            if ((string) config('airtable_token', '') !== '') {
                $mouths = Airtable::poseRecords([$mouthPose])[$mouthPose] ?? [];
            }
            foreach ($src['categories'] as $cat => $list) {
                foreach ($list as $it) {
                    if ($cat === 'mouth') {
                        $add('e:' . $it['key'], $mouths[$it['key']] ?? null);
                        continue;
                    }
                    $add('e:' . $it['key'], $it['src']);
                }
            }
        } elseif ($scope === 'covers') {
            foreach ($src['covers'] as $c) {
                $add('c:' . $c['id'], $c['image'], true);
                foreach ($c['stackables'] as $i => $s) {
                    $add('c:' . $c['id'] . ':s' . ($i + 1), $s, true);
                }
            }
        } elseif ($scope === 'poses') {
            $byNum = [];
            foreach ($src['poses'] as $p) {
                $byNum[(int) $p['num']] = $p;
            }
            $records = Airtable::poseRecords($poseNums);
            foreach ($poseNums as $n) {
                foreach (($byNum[$n]['bodies'] ?? []) as $tone => $url) {
                    $add("p{$n}:body-{$tone}", $url);
                }
                foreach ($records[$n] ?? [] as $col => $url) {
                    $add("p{$n}:{$col}", $url);
                }
            }
        } else {
            throw new HttpError(422, 'Неизвестный раздел синхронизации');
        }
        return $jobs;
    }

    /** Скачивает исходник для браузера администратора (только с разрешённых адресов). */
    public static function proxy(string $url): void
    {
        $host = parse_url($url, PHP_URL_HOST);
        if (!$host || !in_array($host, self::PROXY_HOSTS, true) || parse_url($url, PHP_URL_SCHEME) !== 'https') {
            throw new HttpError(400, 'Адрес не разрешён');
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_USERAGENT => 'knigigai-sync/1.0',
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $type = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        curl_close($ch);
        if ($body === false || $code >= 400) {
            throw new HttpError(502, "Источник ответил ошибкой ($code)");
        }
        $path = (string) parse_url($url, PHP_URL_PATH);
        if (str_ends_with(strtolower(rawurldecode($path)), '.svg') || str_contains($type, 'svg')) {
            $type = 'image/svg+xml';
        }
        header('Content-Type: ' . ($type ?: 'application/octet-stream'));
        header('Cache-Control: no-store');
        echo $body;
    }

    /** Приём готового WebP от браузера. */
    public static function storeAsset(array $post, array $file): array
    {
        $key = (string) ($post['key'] ?? '');
        if (!preg_match('/^(e|p\d+|c):[a-zA-Z0-9_\-:]+$/', $key)) {
            throw new HttpError(422, 'Некорректный ключ');
        }
        if (($file['error'] ?? 1) !== UPLOAD_ERR_OK || ($file['size'] ?? 0) > 8 * 1024 * 1024) {
            throw new HttpError(422, 'Файл не загрузился');
        }
        $bytes = (string) file_get_contents($file['tmp_name']);
        if (substr($bytes, 0, 4) !== 'RIFF' || substr($bytes, 8, 4) !== 'WEBP') {
            throw new HttpError(422, 'Ожидается WebP');
        }
        $nums = [];
        foreach (['fw', 'fh', 'x', 'y', 'w', 'h'] as $f) {
            $nums[$f] = (int) round((float) ($post[$f] ?? 0));
        }
        $dir = substr(sha1($key), 0, 2);
        if (!is_dir(MEDIA_DIR . '/' . $dir)) {
            mkdir(MEDIA_DIR . '/' . $dir, 0775, true);
        }
        $name = $dir . '/' . preg_replace('/[^a-zA-Z0-9_\-]/', '_', $key) . '-' . substr(sha1($bytes), 0, 8) . '.webp';
        file_put_contents(MEDIA_DIR . '/' . $name, $bytes);

        $pdo = Db::pdo();
        $old = $pdo->prepare('SELECT file FROM assets WHERE akey = ?');
        $old->execute([$key]);
        $oldFile = $old->fetchColumn();
        $pdo->prepare('DELETE FROM assets WHERE akey = ?')->execute([$key]);
        $pdo->prepare('INSERT INTO assets (akey, file, fw, fh, x, y, w, h, src, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
            ->execute([$key, $name, $nums['fw'], $nums['fh'], $nums['x'], $nums['y'], $nums['w'], $nums['h'], substr((string) ($post['src'] ?? ''), 0, 190), Db::now()]);
        if ($oldFile && $oldFile !== $name && is_file(MEDIA_DIR . '/' . $oldFile)) {
            @unlink(MEDIA_DIR . '/' . $oldFile);
        }
        return ['key' => $key, 'file' => $name, 'bytes' => strlen($bytes)];
    }

    public static function stats(): array
    {
        $count = (int) Db::pdo()->query('SELECT COUNT(*) FROM assets')->fetchColumn();
        $bytes = 0;
        if (is_dir(MEDIA_DIR)) {
            $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(MEDIA_DIR, FilesystemIterator::SKIP_DOTS));
            foreach ($it as $f) {
                $bytes += $f->getSize();
            }
        }
        $cat = Catalog::get();
        return [
            'assets' => $count,
            'mediaMb' => round($bytes / 1048576, 1),
            'editor' => $cat['sync']['editor'],
            'poses' => $cat['sync']['poses'],
            'coverPoses' => self::coverPoses(),
            'allPoses' => array_map(fn ($p) => (int) $p['num'], Catalog::source()['poses']),
            'books' => (int) Db::pdo()->query('SELECT COUNT(*) FROM books')->fetchColumn(),
            'airtable' => (string) config('airtable_token', '') !== '',
        ];
    }

    public static function coverPoses(): array
    {
        $n = [];
        foreach (Catalog::source()['covers'] as $c) {
            foreach (['giver', 'receiver'] as $r) {
                if (!empty($c[$r]['pose'])) {
                    $n[(int) $c[$r]['pose']] = true;
                }
            }
        }
        $n = array_keys($n);
        sort($n);
        return $n;
    }
}
