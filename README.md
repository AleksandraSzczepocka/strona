# Mimcry Hunters — full-stack prototype

## Uruchomienie

### Tryb deweloperski (auto-reload + kompilacja SCSS)
```bash
npm install
npm run dev
```

Aplikacja działa domyślnie pod `http://localhost:3000`.

## Konto administratora

- E-mail: `admin@mimcryhunters.local`
- Hasło: `Admin123!`

Konto admina jest tworzone automatycznie, jeśli w bazie nie ma jeszcze administratora.

## Stos technologiczny (Tech Stack) i uzasadnienie

### Backend

- Express 5 (express): Nowoczesny, lekki framework webowy obsługujący najnowszą składnię routingu (np. /{*splat}).

- Better-SQLite3 (better-sqlite3): Synchroniczna, niezwykle wydajna baza danych SQLite w jednym pliku, idealna do szybkiego prototypowania i aplikacji bez konieczności stawiania zewnętrznego serwera bazy.

- Zod (zod): Zaawansowana walidacja danych wejściowych (np. formularzy rejestracji, logowania i edycji). Gwarantuje bezpieczeństwo po stronie serwera i eliminację błędnych danych.

- JSON Web Token (jsonwebtoken): Generowanie i weryfikacja bezpiecznych tokenów autoryzacyjnych JWT do obsługi sesji oraz zabezpieczania endpointów API.

- BcryptJS (bcryptjs): Bezpieczne, jednokierunkowe hashowanie haseł użytkowników z użyciem soli przed zapisem do bazy danych.

- Cookie Parser (cookie-parser): Bezpieczne parsowanie i obsługa ciasteczek (cookies) po stronie serwera do przechowywania tokenów/sesji.

- Multer (multer): Obsługa przesyłania plików multipart/form-data, wykorzystywana do bezpiecznego wgrywania awatarów użytkowników.

- Twig (twig): Wydajny silnik szablonów po stronie serwera (SSR), pozwalający na czytelny podział widoków HTML i ponowne wykorzystanie komponentów.

### Style & Narzędzia deweloperskie

- Sass / SCSS (sass): Profesjonalny arkusz stylów umożliwiający stosowanie zmiennych, nestowania i mikserów, co ułatwia zarządzanie kodem CSS.

- PostCSS & Autoprefixer (postcss, postcss-cli, autoprefixer): Pipeline do automatycznego dodawania przedrostków przeglądarkowych (vendor prefixes), zapewniający pełną kompatybilność RWD i spełnienie standardów W3C na różnych przeglądarkach.

- Concurrently (concurrently): Umożliwia jednoczesne uruchamianie serwera Node.js oraz kompilatora SCSS w jednym oknie terminala.

- Nodemon (nodemon): Narzędzie automatycznie restartujące aplikację po wykryciu zmian w kodzie źródłowym podczas prac deweloperskich.

## Konto użytkownika i profil

Po rejestracji użytkownik może się zalogować. Po zalogowaniu przycisk `Zaloguj / Dołącz` w nagłówku zmienia się na profil użytkownika, a zwykły użytkownik jest kierowany do `/profile`.

Profil zawiera:

- nazwę użytkownika,
- e-mail,
- rolę,
- datę dołączenia,
- opis/bio,
- profilówkę,
- posty użytkownika,
- odpowiedzi na forum,
- polubione posty,
- polubione odpowiedzi.

Użytkownik może edytować nazwę, e-mail i bio oraz wgrać profilówkę PNG/JPG/WEBP/GIF do 3 MB.

## Forum

Tematy można otwierać po zalogowaniu, a użytkownicy mogą dodawać odpowiedzi i polubienia. Autorzy są klikalni i prowadzą do ich profili.

## Ważne dla istniejącej instalacji

`server.js` automatycznie dodaje brakujące kolumny profilu i tworzy tabele polubień. Nie trzeba ręcznie kasować bazy.

Projekt korzysta z Express 5, dlatego fallback routingu używa składni `/{*splat}`, a nie `*`.

## Co jeszcze trzeba zrobić? (na ten moment)

- [x] Edycja treści devloga/postów forum
- [ ] Recaptcha lub inne zabezpieczenie podczas rejestracji/logowania
- [ ] Wypełnienie treści + poprawa frontendu (jeśli będzie czas można pobawić się z animowaniem i innymi ciekaawszymi wizualizacjami)
- [ ] Testy użyteczności/funkcjonalności
- [ ] Ewentualne rozszerzenie zarządzania galerią (edycja tytułów, ustawianie alt)
- [ ] Sprawdzenie pod względem dostępności (można zrobić przyciski np. do zwiększania czcionki lub innego motywu, autodeskrypcja?, text to speech?) - sprawdzenie WCAG

