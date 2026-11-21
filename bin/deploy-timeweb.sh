#!/usr/bin/env bash
# Установка/обновление сайта на виртуальном хостинге Timeweb.
# Запуск в SSH или веб-консоли панели:
#   bash <(curl -fsSL https://raw.githubusercontent.com/mpetersev-oss/Knigigai/main/bin/deploy-timeweb.sh) ИМЯ_ПАПКИ_САЙТА
# ИМЯ_ПАПКИ_САЙТА — папка сайта в домашнем каталоге (там, где лежит public_html).
# Файл app/config.php скрипт не трогает: если его нет — создаст из шаблона и попросит заполнить.
set -euo pipefail

SITE="${1:-}"
if [ -z "$SITE" ]; then
  echo "Папки в домашнем каталоге:"; ls -1 ~
  echo; echo "Запустите ещё раз, указав папку сайта, например: ... deploy-timeweb.sh public_html_parent"; exit 1
fi
DIR="$HOME/$SITE"
[ -d "$DIR" ] || { echo "Нет папки $DIR"; exit 1; }

TMP="$(mktemp -d)"
echo "→ Скачиваю код с GitHub…"
if command -v git >/dev/null 2>&1; then
  git clone -q --depth 1 https://github.com/mpetersev-oss/Knigigai.git "$TMP/src"
else
  curl -fsSL https://github.com/mpetersev-oss/Knigigai/archive/refs/heads/main.tar.gz | tar -xz -C "$TMP"
  mv "$TMP"/Knigigai-main "$TMP/src"
fi

echo "→ Копирую файлы в $DIR"
mkdir -p "$DIR/public_html" "$DIR/app" "$DIR/data" "$DIR/storage" "$DIR/public_html/media"
# Старые файлы Timeweb-заглушки (index.html) убираем, чтобы не перехватывали главную
rm -f "$DIR/public_html/index.html"
cp -r "$TMP/src/app/." "$DIR/app/"
cp -r "$TMP/src/data/." "$DIR/data/"
cp -r "$TMP/src/public_html/." "$DIR/public_html/"
[ -f "$DIR/storage/.htaccess" ] || echo "Require all denied" > "$DIR/storage/.htaccess"
rm -f "$DIR/storage/catalog.json"   # каталог пересоберётся сам
rm -rf "$TMP"

if [ ! -f "$DIR/app/config.php" ]; then
  cp "$DIR/app/config.example.php" "$DIR/app/config.php"
  echo "⚠ Создан app/config.php из шаблона — заполните в нём базу, пароль админки и токен Airtable."
fi

chmod -R u+rwX "$DIR/storage" "$DIR/public_html/media"
echo "→ Проверка PHP: $(php -r 'echo PHP_VERSION;')"
php -l "$DIR/public_html/index.php" >/dev/null && echo "✓ Готово. Откройте сайт и /admin."
