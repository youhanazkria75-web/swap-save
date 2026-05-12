# Swap & Save Deployment Checklist

This checklist covers staging and production deployment for the current Swap & Save frontend and backend. Use placeholders in documentation and commit only example env files. Never commit real `.env` files or credentials.

## A) Project Services

- Frontend service: Next.js app in `front-end`
- Backend API service: Express API in `back-end`
- MongoDB database: managed MongoDB or self-hosted MongoDB reachable by the backend
- Persistent upload storage: persistent disk/volume mounted for backend local uploads
- SMTP/email provider: used for email verification and password reset
- Paymob dashboard/config: used for coin checkout and swap service-fee checkout
- Optional Google OAuth: login/signup through Google
- Optional Twilio Verify: phone verification

## B) Frontend Deployment

- Node version: `22.x`
- Install command: `npm install`
- Build command: `npm run build`
- Start command: `npm start`
- Required env:

```env
NEXT_PUBLIC_API_URL=https://your-backend-domain.com
```

The frontend must point to the deployed backend API URL. Do not leave the frontend pointed at local development URLs in staging or production.

## C) Backend Deployment

- Node version: `22.x`
- Install command: `npm install`
- Start command: `npm start`
- Health check endpoints:
  - `/health`
  - `/ready`

Required production env vars:

```env
NODE_ENV=production
PORT=5000
MONGO_URI=mongodb+srv://your-user:your-password@your-cluster.example/swap-save
JWT_SECRET=replace_with_a_long_random_secret
FRONTEND_URL=https://your-frontend-domain.com
CLIENT_URL=https://your-frontend-domain.com
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace_with_a_strong_unique_admin_password
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=smtp-user@example.com
SMTP_PASS=replace_with_smtp_password_or_app_password
SMTP_FROM="Swap & Save <no-reply@example.com>"
PAYMOB_API_KEY=replace_with_paymob_api_key
PAYMOB_INTEGRATION_ID=123456
PAYMOB_IFRAME_ID=654321
PAYMOB_HMAC_SECRET=replace_with_paymob_hmac_secret
PAYMOB_WEBHOOK_URL=https://your-backend-domain.com/payments/paymob/webhook
PAYMOB_SUCCESS_URL=https://your-frontend-domain.com/user/coins/payment/success
PAYMOB_FAILURE_URL=https://your-frontend-domain.com/user/coins/payment/failure
LOCAL_UPLOADS_PERSISTENCE_ACK=false
ENABLE_API_DOCS=false
```

## D) Optional Integrations

Google OAuth, if enabled:

```env
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_CALLBACK_URL=https://your-backend-domain.com/auth/google/callback
```

Twilio Verify, if enabled:

```env
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_VERIFY_SERVICE_SID=your_twilio_verify_service_sid
```

If one value for an optional integration is configured, set the full group for that integration.

## E) Paymob Setup Checklist

- Set Paymob webhook URL to the deployed backend HTTPS URL:
  - `https://your-backend-domain.com/payments/paymob/webhook`
- Set success return URL:
  - `https://your-frontend-domain.com/user/coins/payment/success`
- Set failure return URL:
  - `https://your-frontend-domain.com/user/coins/payment/failure`
- Use Paymob sandbox credentials in staging.
- Use Paymob production credentials only when ready for real payments.
- Confirm `PAYMOB_HMAC_SECRET` matches the Paymob dashboard.
- Test coin package checkout in staging.
- Test swap service-fee checkout for both participants in staging.
- Confirm both paid service-fee state advances the swap to `exchange_setup`.

## F) Upload Storage Checklist

Current uploads use backend local disk:

- Product images: `back-end/uploads/products`
- Avatars: `back-end/uploads/avatars`

Production hosting must attach a persistent disk or volume if keeping local uploads. Set `LOCAL_UPLOADS_PERSISTENCE_ACK=true` only after persistent storage is configured and mounted. If the backend runs on ephemeral hosting without persistent disk, uploaded images can be lost after restart or redeploy.

Future option: migrate uploads to object storage/CDN such as S3-compatible storage or Cloudinary.

## G) CORS Checklist

- `FRONTEND_URL` and `CLIENT_URL` must match the deployed frontend domain.
- Backend should allow only trusted staging/production frontend origins.
- Do not leave random local, preview, or ngrok origins in production env.
- Confirm authenticated requests work from the deployed frontend domain.

## H) Security Checklist

- Change `ADMIN_PASSWORD` to a strong unique password.
- Do not use `admin123`.
- Use a long random `JWT_SECRET`.
- Keep `ENABLE_API_DOCS=false` in production unless docs are intentionally exposed behind external restrictions.
- Ensure `.env` files are never committed.
- Confirm `/api-docs` is disabled by default in production.
- Confirm `/protected` is disabled in production.
- Confirm `/health` and `/ready` are public and working.
- Confirm `NODE_ENV=production` is set for the backend.

## I) Staging Smoke Test Checklist

- Register a new account.
- Login with an existing account.
- Verify email.
- Request password reset.
- Add product with image.
- Restart/redeploy backend and confirm product image still loads.
- Browse marketplace.
- Search marketplace.
- Filter marketplace.
- Save product.
- Request swap.
- Accept swap.
- Send swap messages.
- Pay service fee as requester using Paymob sandbox.
- Pay service fee as receiver using Paymob sandbox.
- Confirm swap reaches `exchange_setup` after both fees are paid.
- Set meet-in-person exchange details.
- Set delivery exchange details.
- Complete swap and rating.
- Open admin dashboard.
- Review admin transactions/reconcile.
- Submit and review reports/support flows.

## J) Final Commands Before Deploy

Frontend:

```bash
npm install
npx tsc --noEmit --pretty false
npm run lint
npm run build
```

Backend:

```bash
npm install
npm test
npm start
```

