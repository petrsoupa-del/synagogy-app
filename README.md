# Synagogy poblíž

Mobilní webová aplikace pro iPhone, iPad i desktop. Po otevření webu může uživatel povolit polohu, zobrazit synagogy v okolí a otevřít detail s dostupnými historickými údaji.

## Co umí

- získat aktuální polohu uživatele,
- zobrazit mapu okolí,
- najít blízké současné i bývalé synagogy,
- otevřít detail objektu,
- dotáhnout stručný historický text přes Wikidata a Wikipedii, pokud existuje,
- fungovat jako web appka po přidání na plochu na iPhonu/iPadu.

## Lokální spuštění

1. Nainstaluj Node.js 20+.
2. V terminálu přejdi do složky projektu.
3. Spusť:

```bash
npm install
npm start
```

4. Otevři v prohlížeči:

```text
http://localhost:3000
```

## Nejlepší nasazení pro iPhone

Doporučené nasazení je **Render**. Express aplikace tam běží jako běžná webová služba a Render přidává veřejnou HTTPS adresu, což je důležité pro geolokaci v mobilním prohlížeči.

### Postup nasazení na Render

1. Nahraj tuto složku do nového GitHub repozitáře.
2. Přihlas se do Renderu.
3. Zvol **New + → Web Service**.
4. Připoj GitHub repozitář.
5. Render si načte konfiguraci z `render.yaml`.
6. Klikni na vytvoření služby.
7. Po nasazení dostaneš veřejný odkaz typu:

```text
https://synagogue-near-me.onrender.com
```

Ten odkaz pak otevřeš na iPhonu v Safari a zvolíš **Sdílet → Přidat na plochu**.

## Soubory pro nasazení

- `render.yaml` – konfigurace pro Render
- `Dockerfile` – alternativní nasazení do Docker prostředí
- `public/` – front-end
- `server/` – back-end

## Poznámky k datům

- Geolokace v mobilu potřebuje HTTPS nebo localhost.
- Data jsou tahána z otevřených zdrojů v reálném čase, takže kvalita se liší objekt od objektu.
- Údaj „co je v bývalé synagoze dnes“ bude dostupný jen tam, kde ho otevřená data skutečně obsahují.

## Další doporučený krok

Pro produkční verzi bych doplnil:

- vlastní databázi kurátorských dat,
- editor záznamů pro ruční opravy,
- cache a limity proti přetížení externích API,
- více jazyků,
- fotografie,
- sdílený odkaz na konkrétní místo.
