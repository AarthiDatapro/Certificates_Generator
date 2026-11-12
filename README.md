# Certificates

Standalone certificate designer. It does not use the LMS.

Template designing starts with an Excel file. The first row is the header, and each column is a variable. Upload a PNG or JPG, drag those columns onto the picture, then save the coordinates to Supabase.

History lists the saved templates and opens them again.

## Connect Supabase

1. In the Supabase SQL editor, run `supabase.sql`.
2. Open `src/supabase_config.js`.
3. Replace `SUPABASE_URL` with your `https://….supabase.co` link.
4. Replace `SUPABASE_ANON_KEY` with the anon public key.

Excel row values stay in the browser for preview. Supabase stores the template name, the picture, the column names, and the placed coordinates.

## Run

```bash
cd certificates
npm install
npm run dev
```

Open http://localhost:5190.
