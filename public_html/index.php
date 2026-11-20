<?php
declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = '/' . trim((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/');

function json_out($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function json_in(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > 200000) {
        throw new HttpError(413, 'Слишком большой запрос');
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

// ---------- API ----------
if (str_starts_with($path, '/api/')) {
    $route = substr($path, 4);

    if ($route === '/catalog' && $method === 'GET') {
        $cat = Catalog::get();
        $etag = '"' . $cat['v'] . '"';
        header('ETag: ' . $etag);
        header('Cache-Control: public, max-age=60');
        if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
            http_response_code(304);
            exit;
        }
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($cat, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($route === '/books' && $method === 'POST') {
        json_out(Books::create(), 201);
        exit;
    }

    if (preg_match('#^/books/([a-zA-Z0-9]+)$#', $route, $m)) {
        if ($method === 'GET') {
            json_out(Books::find($m[1]));
            exit;
        }
        if ($method === 'PATCH' || $method === 'POST') {
            json_out(Books::update($m[1], json_in()));
            exit;
        }
    }

    // ----- админка -----
    if ($route === '/admin/login' && $method === 'POST') {
        $ok = Admin::login((string) (json_in()['password'] ?? ''));
        json_out(['ok' => $ok], $ok ? 200 : 401);
        exit;
    }
    if ($route === '/admin/logout' && $method === 'POST') {
        Admin::logout();
        json_out(['ok' => true]);
        exit;
    }
    if ($route === '/admin/me') {
        json_out(['logged' => Admin::isLogged()]);
        exit;
    }
    if (str_starts_with($route, '/admin/')) {
        Admin::require();
        switch ($route) {
            case '/admin/stats':
                json_out(Admin::stats());
                exit;
            case '/admin/plan':
                $in = json_in();
                $poses = array_values(array_filter(array_map('intval', (array) ($in['poses'] ?? []))));
                json_out(['jobs' => Admin::plan((string) ($in['scope'] ?? ''), $poses, !empty($in['onlyMissing']))]);
                exit;
            case '/admin/proxy':
                Admin::proxy((string) ($_GET['u'] ?? ''));
                exit;
            case '/admin/asset':
                json_out(Admin::storeAsset($_POST, $_FILES['file'] ?? []));
                exit;
            case '/admin/rebuild':
                $c = Catalog::rebuild();
                json_out(['ok' => true, 'v' => $c['v']]);
                exit;
            case '/admin/books':
                json_out(['books' => Books::latest(100)]);
                exit;
        }
    }

    throw new HttpError(404, 'Не найдено');
}

// ---------- Страницы (одностраничное приложение) ----------
$isAdmin = $path === '/admin';
$ver = substr(md5((string) @filemtime(__DIR__ . '/assets/js/app.js') . (string) @filemtime(__DIR__ . '/assets/css/app.css') . (string) @filemtime(__DIR__ . '/assets/js/admin.js')), 0, 8);
$price = number_format((int) config('price_rub', 4900), 0, '', ' ');
header('Content-Type: text/html; charset=utf-8');
?><!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= $isAdmin ? 'Админка — Книгигай' : 'Книгигай — книга, где главные герои вы' ?></title>
<meta name="description" content="Персональная книга-подарок: создайте героев, похожих на вас и близкого человека, выберите обложку — и мы напечатаем книгу о вашей истории. <?= $price ?> ₽, твёрдый переплёт.">
<meta name="theme-color" content="#f7efe9">
<?php if ($isAdmin): ?><meta name="robots" content="noindex"><?php endif; ?>
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Onest:wght@400;500;600;700&family=Advent+Pro:wght@600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/app.css?v=<?= $ver ?>">
</head>
<body class="<?= $isAdmin ? 'is-admin' : '' ?>">
<div id="app" aria-live="polite"></div>
<noscript><p style="padding:40px;text-align:center">Для работы конструктора включите JavaScript.</p></noscript>
<?php if ($isAdmin): ?>
<script type="module" src="/assets/js/admin.js?v=<?= $ver ?>"></script>
<?php else: ?>
<script type="module" src="/assets/js/app.js?v=<?= $ver ?>"></script>
<?php endif; ?>
</body>
</html>
