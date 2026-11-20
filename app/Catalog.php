<?php
declare(strict_types=1);

/**
 * Каталог вещей, поз и обложек.
 *
 * Источник описания — data/source.json (выгрузка из старого Webflow CMS + структура Airtable).
 * Сами картинки после синхронизации лежат в public_html/media в формате WebP,
 * а их координаты внутри кадра 2855×3305 — в таблице assets.
 * Если картинка ещё не синхронизирована, отдаётся исходный адрес (медленнее, но работает).
 */
final class Catalog
{
    public const CACHE = STORAGE_DIR . '/catalog.json';

    public static function source(): array
    {
        static $src = null;
        if ($src === null) {
            $src = json_decode((string) file_get_contents(APP_ROOT . '/data/source.json'), true, 512, JSON_THROW_ON_ERROR);
        }
        return $src;
    }

    /** Готовый каталог для фронтенда (с кешем на диске). */
    public static function get(): array
    {
        if (is_file(self::CACHE)) {
            $data = json_decode((string) file_get_contents(self::CACHE), true);
            if (is_array($data)) {
                return $data;
            }
        }
        return self::rebuild();
    }

    public static function rebuild(): array
    {
        $src = self::source();
        $fw = $src['frame']['w'];
        $fh = $src['frame']['h'];

        $synced = [];
        try {
            foreach (Db::pdo()->query('SELECT * FROM assets') as $r) {
                $synced[$r['akey']] = $r;
            }
        } catch (Throwable $e) {
            error_log('[catalog] assets unavailable: ' . $e->getMessage());
        }

        $assets = [];
        $put = function (string $key, ?string $fallbackSrc, bool $isCover = false) use (&$assets, $synced, $fw, $fh): void {
            if (isset($synced[$key])) {
                $r = $synced[$key];
                $sx = $isCover ? 1 : $fw / max(1, (int) $r['fw']);
                $sy = $isCover ? 1 : $fh / max(1, (int) $r['fh']);
                $assets[$key] = [MEDIA_URL . '/' . $r['file'], round($r['x'] * $sx, 1), round($r['y'] * $sy, 1), round($r['w'] * $sx, 1), round($r['h'] * $sy, 1)];
            } elseif ($fallbackSrc) {
                $assets[$key] = [$fallbackSrc, 0, 0, $isCover ? 1 : $fw, $isCover ? 1 : $fh];
            }
        };

        // Базовые тела и бельё для редактора
        foreach ($src['tones'] as $t) {
            $put('e:body-' . $t['key'], $t['body']);
        }

        $items = [];
        foreach ($src['categories'] as $cat => $list) {
            foreach ($list as $it) {
                $put('e:' . $it['key'], $it['src']);
                $meta = $it;
                unset($meta['src']);
                $items[$cat][] = $meta;
            }
        }

        // Позы: тело по тону кожи (из Webflow) + все слои из Airtable (только после синхронизации)
        $poses = [];
        foreach ($src['poses'] as $p) {
            $n = (int) $p['num'];
            foreach ($p['bodies'] as $tone => $url) {
                $put("p{$n}:body-{$tone}", $url);
            }
            $poses[] = ['num' => $n, 'name' => $p['name']];
        }
        $poseLayerCount = [];
        foreach ($synced as $key => $_) {
            if (preg_match('/^p(\d+):(?!body-)/', $key, $m)) {
                $put($key, null);
                $poseLayerCount[(int) $m[1]] = ($poseLayerCount[(int) $m[1]] ?? 0) + 1;
            }
        }

        $covers = [];
        foreach ($src['covers'] as $c) {
            $put('c:' . $c['id'], $c['image'], true);
            $stack = [];
            foreach ($c['stackables'] as $i => $s) {
                $k = 'c:' . $c['id'] . ':s' . ($i + 1);
                $put($k, $s, true);
                $stack[] = $k;
            }
            $covers[] = [
                'id' => $c['id'], 'occasion' => $c['occasion'], 'text' => $c['text'], 'color' => $c['color'],
                'textX' => $c['textX'], 'textY' => $c['textY'],
                'bg' => 'c:' . $c['id'], 'stackables' => $stack,
                'giver' => $c['giver'], 'receiver' => $c['receiver'],
            ];
        }

        $editorTotal = count($src['tones']);
        foreach ($src['categories'] as $list) {
            $editorTotal += count($list);
        }
        $editorSynced = count(array_filter(array_keys($synced), fn ($k) => str_starts_with($k, 'e:')));

        $catalog = [
            'v' => substr(sha1((string) json_encode([$assets, $covers])), 0, 10),
            'frame' => $src['frame'],
            'tones' => array_map(fn ($t) => ['key' => $t['key'], 'label' => $t['label'], 'color' => $t['color']], $src['tones']),
            'items' => $items,
            'poses' => $poses,
            'covers' => $covers,
            'coverRef' => $src['coverRef'],
            'assets' => $assets,
            'sync' => [
                'editor' => [$editorSynced, $editorTotal],
                'poses' => $poseLayerCount,
            ],
            'price' => (int) config('price_rub', 4900),
        ];

        if (!is_dir(STORAGE_DIR)) {
            mkdir(STORAGE_DIR, 0775, true);
        }
        file_put_contents(self::CACHE . '.tmp', json_encode($catalog, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        rename(self::CACHE . '.tmp', self::CACHE);
        return $catalog;
    }

    /** Все ключи вещей, которые должны быть у каждой позы (= колонки таблицы Poses в Airtable). */
    public static function poseLayerKeys(): array
    {
        $keys = [];
        foreach (self::source()['categories'] as $list) {
            foreach ($list as $it) {
                $keys[] = $it['key'];
            }
        }
        return $keys;
    }
}
