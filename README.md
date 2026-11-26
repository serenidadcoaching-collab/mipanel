# Mi Panel — Emprendimiento · TFM · Finanzas

Web app ultraligera (**menos de 50 KB**, sin `node_modules` ni instalación).
Se abre en el navegador, se puede publicar gratis y guarda los datos en
**Supabase** (base de datos PostgreSQL gratuita) o, si aún no está configurada,
en el propio navegador.

| Sección | Qué puedes registrar |
|---|---|
| **Emprendimiento** | tareas, hitos, ideas, contactos |
| **TFM** | capítulos (con % de avance), tareas, referencias, reuniones con tutor/a |
| **Finanzas** | gastos, ingresos, objetivos de ahorro, deudas → balance mensual |
| **Resumen** | balance del mes, progreso del TFM, pendientes y próximas fechas |

> La sección de finanzas es una herramienta de **seguimiento**, no un asesor financiero profesional.

---

## Paso 0 · Probarla ya (sin configurar nada)
Haz doble clic en `index.html`. Funciona en **modo local**: los datos se quedan solo en ese navegador.

## Paso 1 · Crear tu cuenta de GitHub (gratis)
1. Ve a <https://github.com/signup>.
2. Introduce email, contraseña y nombre de usuario, y resuelve la verificación.
3. Confirma el código que te llega por correo.
4. **Recomendado:** activa la verificación en dos pasos (Settings → Password and authentication).

## Paso 2 · Crear la base de datos gratuita (Supabase)
Plan gratuito: 500 MB de base de datos, 50.000 usuarios, sin tarjeta.
1. Ve a <https://supabase.com> → **Start your project** → *Continue with GitHub* (usa la cuenta del paso 1).
2. **New project**: nombre `mipanel`, región **West EU (Ireland)** o **Central EU (Frankfurt)**,
   genera una contraseña de base de datos y guárdala en un sitio seguro.
3. Cuando termine de crearse: **SQL Editor → New query**, pega el contenido de
   [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
4. **Project Settings → API** (o *Connect*): copia
   - `Project URL`
   - `anon` / `publishable` key (¡**no** la `service_role` / `secret`!)
5. Pégalas en [`config.js`](config.js).
6. **Authentication → URL Configuration**: en *Site URL* pon la dirección donde
   publicarás la app (paso 3). Para probar en local añade también `http://localhost:8080`
   en *Redirect URLs*.

> Proyectos gratuitos de Supabase se **pausan tras 7 días sin uso**; se reactivan
> con un clic desde el panel de Supabase. Tus datos no se pierden.

## Paso 3 · Subir el código a GitHub y publicarla gratis
**Opción A — sin instalar nada (la que menos ocupa):**
1. En GitHub: **New repository** → nombre `mipanel` → *Public* → Create.
2. *uploading an existing file* → arrastra **todos** los archivos de esta carpeta
   (incluida la carpeta `supabase`) → **Commit changes**.
3. **Settings → Pages** → *Source: Deploy from a branch* → `main` / `root` → Save.
4. En 1–2 minutos estará en `https://TU-USUARIO.github.io/mipanel/`.
   Pon esa URL en Supabase (paso 2.6).

Es seguro que el repositorio sea público: el código no contiene datos tuyos y la
clave `anon` está protegida por las políticas RLS. Tus datos viven en Supabase.

**Opción B — con Git (si quieres trabajar desde el ordenador):**
```powershell
winget install --id Git.Git -e
```
Luego, en esta carpeta:
```powershell
git init; git add .; git commit -m "Primera versión"; git branch -M main
git remote add origin https://github.com/TU-USUARIO/mipanel.git; git push -u origin main
```

## Probar en local con Supabase
El enlace mágico de login necesita una dirección `http://`, no `file://`:
```powershell
npx --yes serve -l 8080 .
```
y abre <http://localhost:8080>.

## Estructura
```
index.html          página
styles.css          estilos
app.js              lógica (pestañas, formularios, Supabase / modo local)
config.js           tus claves de Supabase (URL + anon key)
supabase/schema.sql tabla + seguridad (RLS)
```
