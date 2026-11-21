<?php
declare(strict_types=1);

/**
 * Книга-черновик. Хранится одной JSON-записью, доступ — по секретному токену в ссылке.
 * Регистрация не нужна: ссылка /b/<token> и есть «ключ» от книги.
 */
final class Books
{
    public const OCCASIONS = ['День Рождения', 'наш праздник', 'свадьба', '8 марта', 'выпускной'];
    public const RELATIONS = ['partner', 'spouse', 'friend', 'mom', 'dad', 'sibling', 'child', 'other'];
    /** Сколько сюжетных страниц можно сделать (плюс посвящение и финал) */
    public const MIN_PAGES = 6;
    public const MAX_PAGES = 20;
    public const TEXT_MAX = 220;

    public static function create(): array
    {
        $token = self::newToken();
        $data = ['heroes' => ['giver' => null, 'receiver' => null], 'occasion' => null, 'relation' => null, 'cover' => null, 'pages' => null];
        $now = Db::now();
        Db::pdo()->prepare('INSERT INTO books (token, data, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
            ->execute([$token, json_encode($data, JSON_UNESCAPED_UNICODE), 'draft', $now, $now]);
        return self::find($token);
    }

    public static function find(string $token): array
    {
        if (!preg_match('/^[a-zA-Z0-9]{16,40}$/', $token)) {
            throw new HttpError(404, 'Книга не найдена');
        }
        $st = Db::pdo()->prepare('SELECT * FROM books WHERE token = ?');
        $st->execute([$token]);
        $row = $st->fetch();
        if (!$row) {
            throw new HttpError(404, 'Книга не найдена. Проверьте ссылку.');
        }
        return self::present($row);
    }

    /** Частичное обновление: принимаются только известные поля с проверенными значениями. */
    public static function update(string $token, array $patch): array
    {
        $book = self::find($token);
        if ($book['status'] !== 'draft') {
            throw new HttpError(409, 'Книга уже оплачена и передана в печать — изменить её нельзя. Напишите нам, если нужна правка.');
        }
        $data = $book['data'];

        if (array_key_exists('heroes', $patch) && is_array($patch['heroes'])) {
            foreach (['giver', 'receiver'] as $role) {
                if (array_key_exists($role, $patch['heroes'])) {
                    $data['heroes'][$role] = $patch['heroes'][$role] === null ? null : self::cleanHero($patch['heroes'][$role]);
                }
            }
        }
        if (array_key_exists('occasion', $patch)) {
            $o = $patch['occasion'];
            if ($o !== null && !in_array($o, self::OCCASIONS, true)) {
                throw new HttpError(422, 'Неизвестный повод');
            }
            $data['occasion'] = $o;
        }
        if (array_key_exists('relation', $patch)) {
            $r = $patch['relation'];
            if ($r !== null && !in_array($r, self::RELATIONS, true)) {
                throw new HttpError(422, 'Неизвестный тип отношений');
            }
            $data['relation'] = $r;
        }
        if (array_key_exists('cover', $patch)) {
            $data['cover'] = $patch['cover'] === null ? null : self::cleanCover($patch['cover']);
        }
        if (array_key_exists('pages', $patch)) {
            $data['pages'] = $patch['pages'] === null ? null : self::cleanPages($patch['pages']);
        }
        $email = $book['email'];
        if (array_key_exists('email', $patch)) {
            $e = trim((string) $patch['email']);
            if ($e !== '' && !filter_var($e, FILTER_VALIDATE_EMAIL)) {
                throw new HttpError(422, 'Проверьте адрес почты');
            }
            $email = $e ?: null;
        }

        Db::pdo()->prepare('UPDATE books SET data = ?, email = ?, updated_at = ? WHERE token = ?')
            ->execute([json_encode($data, JSON_UNESCAPED_UNICODE), $email, Db::now(), $token]);
        return self::find($token);
    }

    public static function latest(int $limit = 50): array
    {
        $st = Db::pdo()->query('SELECT * FROM books ORDER BY updated_at DESC LIMIT ' . max(1, min(500, $limit)));
        return array_map([self::class, 'present'], $st->fetchAll());
    }

    private static function present(array $row): array
    {
        $order = null;
        try {
            $st = Db::pdo()->prepare('SELECT token, status FROM orders WHERE book_token = ? ORDER BY id DESC LIMIT 1');
            $st->execute([$row['token']]);
            $order = $st->fetch() ?: null;
        } catch (Throwable $e) {
            // таблицы заказов ещё нет — не страшно
        }
        return [
            'order' => $order,
            'token' => $row['token'],
            'data' => json_decode($row['data'], true) ?: [],
            'email' => $row['email'],
            'status' => $row['status'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
        ];
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

    private static function keysOf(string $cat, ?string $gender = null): array
    {
        $out = [];
        foreach (Catalog::source()['categories'][$cat] ?? [] as $it) {
            if ($gender && isset($it['gender']) && !in_array($it['gender'], [$gender, 'any'], true)) {
                continue;
            }
            $out[] = $it['key'];
        }
        return $out;
    }

    private static function cleanHero($h): array
    {
        if (!is_array($h)) {
            throw new HttpError(422, 'Некорректные данные героя');
        }
        $name = trim(preg_replace('/\s+/u', ' ', (string) ($h['name'] ?? '')));
        if ($name === '' || mb_strlen($name) > 30) {
            throw new HttpError(422, 'Имя героя — от 1 до 30 символов');
        }
        $gender = ($h['gender'] ?? '') === 'male' ? 'male' : 'female';
        $tones = array_column(Catalog::source()['tones'], 'key');
        $tone = in_array((string) ($h['tone'] ?? ''), $tones, true) ? (string) $h['tone'] : $tones[0];

        $hairColors = array_values(array_unique(array_column(Catalog::source()['categories']['hair'], 'color')));
        $out = [
            'name' => $name,
            'gender' => $gender,
            'tone' => $tone,
            'face' => max(1, min(7, (int) ($h['face'] ?? 1))),
            'hairColor' => in_array($h['hairColor'] ?? '', $hairColors, true) ? $h['hairColor'] : 'black',
            'hairStyle' => isset($h['hairStyle']) && $h['hairStyle'] !== null ? max(1, min(11, (int) $h['hairStyle'])) : null,
        ];
        $pick = function (string $field, string $cat, bool $required, ?string $g = null) use ($h, &$out): void {
            $v = $h[$field] ?? null;
            $allowed = self::keysOf($cat, $g);
            if ($v === null || $v === '') {
                if ($required) {
                    $out[$field] = $allowed[0] ?? null;
                } else {
                    $out[$field] = null;
                }
                return;
            }
            if (!in_array($v, $allowed, true)) {
                throw new HttpError(422, "Недопустимое значение: $field");
            }
            $out[$field] = $v;
        };
        $pick('eyes', 'eyes', true, $gender);
        $pick('nose', 'nose', true);
        $pick('mouth', 'mouth', true);
        $pick('beard', 'beard', false);
        $pick('top', 'tops', false, $gender);
        $pick('jacket', 'jackets', false);
        $pick('bodice', 'bodice', false);
        $pick('pants', 'pants', false);
        $pick('shoes', 'shoes', false);
        $pick('glasses', 'glasses', false);
        $pick('hat', 'hats', false);
        if ($gender === 'female') {
            $out['beard'] = null;
        }
        if ($out['jacket'] && $out['bodice']) {
            $out['bodice'] = null; // жакет и корсет вместе не надеваются
        }
        return $out;
    }

    public static function setStatus(string $token, string $status): void
    {
        Db::pdo()->prepare('UPDATE books SET status = ?, updated_at = ? WHERE token = ?')->execute([$status, Db::now(), $token]);
    }

    /** Готова ли книга к заказу: герои одеты, есть обложка и страницы. */
    public static function readiness(array $data): ?string
    {
        foreach (['giver', 'receiver'] as $r) {
            $h = $data['heroes'][$r] ?? null;
            if (!$h || !($h['top'] || $h['jacket'] || $h['bodice']) || !$h['pants'] || !$h['shoes']) {
                return 'Создайте и оденьте обоих героев';
            }
        }
        if (empty($data['cover'])) {
            return 'Выберите обложку';
        }
        $n = count($data['pages']['items'] ?? []);
        if ($n < self::MIN_PAGES) {
            return 'Добавьте страницы книги';
        }
        return null;
    }

    private static function cleanText($v, string $what): string
    {
        $t = trim(preg_replace('/[ \t]+/u', ' ', str_replace("\r", '', (string) $v)));
        $t = preg_replace("/\n{3,}/u", "\n\n", $t);
        if (mb_strlen($t) > self::TEXT_MAX) {
            throw new HttpError(422, "$what — не длиннее " . self::TEXT_MAX . ' символов');
        }
        return $t;
    }

    private static function cleanPages($p): array
    {
        if (!is_array($p)) {
            throw new HttpError(422, 'Некорректные страницы');
        }
        $ids = array_column(Catalog::pages()['templates'], 'id');
        $items = [];
        foreach (array_values((array) ($p['items'] ?? [])) as $i => $it) {
            if (!is_array($it) || !in_array($it['t'] ?? '', $ids, true)) {
                throw new HttpError(422, 'Неизвестная сцена на странице ' . ($i + 1));
            }
            $items[] = ['t' => $it['t'], 'text' => self::cleanText($it['text'] ?? '', 'Текст страницы ' . ($i + 1)), 'swap' => !empty($it['swap'])];
        }
        if (count($items) > self::MAX_PAGES) {
            throw new HttpError(422, 'В книге может быть не больше ' . self::MAX_PAGES . ' страниц с героями');
        }
        return [
            'dedication' => self::cleanText($p['dedication'] ?? '', 'Посвящение'),
            'final' => self::cleanText($p['final'] ?? '', 'Последняя страница'),
            'items' => $items,
        ];
    }

    private static function cleanCover($c): array
    {
        if (!is_array($c)) {
            throw new HttpError(422, 'Некорректная обложка');
        }
        $ids = array_column(Catalog::source()['covers'], 'id');
        if (!in_array($c['id'] ?? '', $ids, true)) {
            throw new HttpError(422, 'Такой обложки нет');
        }
        $text = trim(preg_replace('/\s+/u', ' ', (string) ($c['text'] ?? '')));
        if (mb_strlen($text) > 60) {
            throw new HttpError(422, 'Название на обложке — не длиннее 60 символов');
        }
        return [
            'id' => $c['id'],
            'text' => $text,
            'swap' => !empty($c['swap']),
            'solo' => in_array($c['solo'] ?? 'giver', ['giver', 'receiver'], true) ? ($c['solo'] ?? 'giver') : 'giver',
        ];
    }
}
