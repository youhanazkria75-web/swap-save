# Google OAuth Setup

## Google Cloud Console

1. Open Google Cloud Console and create or select a project.
2. Go to APIs & Services > OAuth consent screen, configure the app, and add your test users while the app is in testing mode.
3. Go to APIs & Services > Credentials > Create Credentials > OAuth client ID.
4. Choose Web application.
5. Add this Authorized redirect URI for local development:
   `http://localhost:5000/auth/google/callback`
6. Copy the client ID and client secret into `back-end/.env`.

## Backend Environment

```env
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback
FRONTEND_URL=http://localhost:3000
```

## Checklist

- Backend runs on `http://localhost:5000`.
- Frontend runs on `http://localhost:3000`.
- Google redirect URI exactly matches `GOOGLE_CALLBACK_URL`.
- `ADMIN_EMAIL` is set to the email that should become admin.
- Restart the backend after changing `.env`.
