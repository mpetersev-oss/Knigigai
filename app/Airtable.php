<?php
declare(strict_types=1);

/** Минимальный клиент Airtable — только чтение таблицы Poses для синхронизации. */
final class Airtable
{
    /**
     * Возвращает [номер позы => [колонка => свежий URL вложения]].
     * URL вложений Airtable живут несколько часов, поэтому запрашиваются прямо перед синхронизацией.
     */
    public static function poseRecords(array $poseNums): array
    {
        $token = (string) config('airtable_token', '');
        if ($token === '') {
            throw new HttpError(422, 'Не задан airtable_token в app/config.php');
        }
        $a = Catalog::source()['airtable'];
        $wanted = array_flip(array_map('intval', $poseNums));
        $layerKeys = array_flip(Catalog::poseLayerKeys());

        $out = [];
        $offset = null;
        do {
            $q = ['pageSize' => 100];
            if ($offset) {
                $q['offset'] = $offset;
            }
            $url = 'https://api.airtable.com/v0/' . rawurlencode($a['baseId']) . '/' . rawurlencode($a['posesTable']) . '?' . http_build_query($q);
            $res = self::get($url, $token);
            foreach ($res['records'] ?? [] as $rec) {
                $f = $rec['fields'] ?? [];
                $num = (int) ($f[$a['poseIdField']] ?? 0);
                if (!isset($wanted[$num])) {
                    continue;
                }
                foreach ($f as $col => $val) {
                    if (isset($layerKeys[$col]) && is_array($val) && !empty($val[0]['url'])) {
                        $out[$num][$col] = $val[0]['url'];
                    }
                }
            }
            $offset = $res['offset'] ?? null;
        } while ($offset);
        return $out;
    }

    private static function get(string $url, string $token): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token],
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if ($body === false || $code !== 200) {
            throw new HttpError(502, "Airtable ответил ошибкой ($code). Проверьте токен и доступ к базе.");
        }
        return json_decode((string) $body, true) ?: [];
    }
}
