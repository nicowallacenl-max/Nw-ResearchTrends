# N.E.O Brief

Daily fashion intelligence brief for N.E.O — emails a sharp 5-section report every weekday at 07:30 Amsterdam time. Uses Claude with web search to pull live fashion news, then delivers it as a clean HTML email via Gmail.

---

## What it sends

Five sections, under 400 words, written like a fashion editor:

- **TREND SIGNALS** — silhouettes, fabrics, colours moving in minimalist/Gen Z fashion
- **COMPETITOR DROPS** — Our Legacy, Auralee, Lemaire, Toteme, and peers
- **CULTURAL PULSE** — moments and subcultures to inform N.E.O direction
- **GUANGZHOU / MANUFACTURING** — Chinese manufacturing and sourcing news
- **ONE CREATIVE PROMPT** — one actionable design idea for N.E.O

---

## Setup

### 1. Install dependencies

```bash
cd neo-brief
npm install
```

### 2. Get your Anthropic API key

Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → Create key.

### 3. Set up Gmail OAuth2

Gmail requires OAuth2 for sending mail from code. This is a one-time setup.

#### a. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Go to **APIs & Services → Library**
4. Search for **Gmail API** and enable it

#### b. Create OAuth2 credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Under **Authorised redirect URIs**, add:
   ```
   https://developers.google.com/oauthplayground
   ```
5. Click **Create** — copy the **Client ID** and **Client Secret**

#### c. Configure the OAuth consent screen (if prompted)

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External**, fill in app name and your email
3. Add scope: `https://mail.google.com/`
4. Add your Gmail address as a **Test user**

#### d. Get the refresh token via OAuth2 Playground

1. Go to [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)
2. Click the gear icon (top right) → check **Use your own OAuth credentials**
3. Enter your **Client ID** and **Client Secret** from step b
4. In the left panel, find **Gmail API v1** and select:
   ```
   https://mail.google.com/
   ```
5. Click **Authorise APIs** → sign in with your Gmail account
6. Click **Exchange authorisation code for tokens**
7. Copy the **Refresh token** from the response

### 4. Configure .env

```bash
cp .env.example .env
```

Edit `.env` and fill in all values:

```
ANTHROPIC_API_KEY=sk-ant-...
GMAIL_USER=your@gmail.com
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-...
GMAIL_REFRESH_TOKEN=1//...
```

---

## Running

### Manual trigger

Generates and emails the brief immediately:

```bash
node neo-brief.js --now
# or
npm run now
```

### Scheduled (foreground)

Starts the cron process — runs Mon–Fri at 07:30 Amsterdam time:

```bash
node neo-brief.js
# or
npm start
```

### Background with pm2

Keep it running permanently, surviving reboots:

```bash
# Install pm2 globally (once)
npm install -g pm2

# Start the scheduler
pm2 start neo-brief.js --name neo-brief

# Save so it restarts on reboot
pm2 save
pm2 startup   # follow the printed command to enable on boot

# Useful commands
pm2 status          # check it's running
pm2 logs neo-brief  # tail the logs
pm2 stop neo-brief  # pause
pm2 delete neo-brief # remove from pm2
```

To trigger a manual send without stopping the scheduler:

```bash
node neo-brief.js --now
```

---

## Troubleshooting

**"Missing environment variables"** — check your `.env` file is in the same directory as `neo-brief.js` and all 5 values are set.

**Gmail auth errors** — refresh tokens can expire if the OAuth consent screen is in "Testing" mode and hasn't been used for 7 days. Re-run the OAuth2 Playground flow (step 3d) to get a new refresh token. To avoid this, publish the consent screen in Google Cloud Console.

**"No brief content was generated"** — the Anthropic API call returned no text. Check your `ANTHROPIC_API_KEY` and that your account has web search access.
