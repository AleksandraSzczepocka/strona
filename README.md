# Mimcry Hunters — full-stack prototype

## Uruchomienie

```bash
npm install
npm start
```

Aplikacja działa domyślnie pod `http://localhost:3000`.

## Konto administratora

- E-mail: `admin@mimcryhunters.local`
- Hasło: `Admin123!`

Konto admina jest tworzone automatycznie, jeśli w bazie nie ma jeszcze administratora.

## Konto użytkownika i profil

Po rejestracji użytkownik może się zalogować. Po zalogowaniu przycisk `Zaloguj / Dołącz` w nagłówku zmienia się na profil użytkownika, a zwykły użytkownik jest kierowany do `/profile.html`.

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
