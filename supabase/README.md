# Supabase Setup for Tower Exchange

This guide will help you set up Supabase to store activities and AI chat conversations.

## Prerequisites

1. A Supabase account (sign up at https://supabase.com)
2. A Supabase project created

## Setup Steps

### 1. Create the Database Schema

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `schema.sql` in this folder
4. Paste and run the SQL in the SQL Editor
5. This will create:
   - The `activities` table (for trading activities)
   - The `ai_chat_sessions` table (for chat conversations)
   - The `ai_chat_messages` table (for individual chat messages)
   - Indexes for performance
   - Row Level Security policies
   - Automatic timestamp triggers
   - Row Level Security (RLS) policies
   - Automatic timestamp triggers

### 2. Get Your Supabase Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following:
   - **Project URL** (under "Project URL")
   - **anon/public key** (under "Project API keys" → "anon public")

### 3. Add Environment Variables

Add these to your `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**Example:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Install Supabase Client

Run this command in your project root:

```bash
npm install @supabase/supabase-js
```

### 5. Restart Your Dev Server

After adding the environment variables, restart your Next.js dev server:

```bash
npm run dev
```

## Testing

### Insert Test Data

You can insert test data using the SQL Editor in Supabase:

```sql
INSERT INTO activities (
  wallet_address,
  type,
  source_currency_ticker,
  source_network_name,
  destination_currency_ticker,
  destination_network_name,
  status,
  amount,
  transaction_hash
) VALUES (
  '0x1234567890123456789012345678901234567890', -- Replace with your wallet address
  'Swap',
  'USDC',
  'Arc',
  'ETH',
  'Arc',
  'Successful',
  100.50,
  '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
);
```

## Schema Overview

### Activities Table

The `activities` table stores trading activities:

- **wallet_address**: User's wallet address
- **type**: Activity type (Swap, Deposit, Withdraw, Transfer)
- **source_currency_ticker**: Source token (USDC, ETH, etc.)
- **source_network_name**: Source network (Arc, Ethereum, etc.)
- **destination_currency_ticker**: Destination token (nullable)
- **destination_network_name**: Destination network (nullable)
- **status**: Transaction status (Successful, Failed, Pending)
- **timestamp**: When the activity occurred
- **amount**: Transaction amount
- **transaction_hash**: Blockchain transaction hash
- **fee**: Transaction fee
- **fee_currency_ticker**: Fee currency

### AI Chat Tables

The schema includes two tables for AI chat functionality:

#### `ai_chat_sessions`
Stores conversation sessions:
- **id**: Unique session identifier
- **wallet_address**: User's wallet address
- **title**: Session title
- **is_active**: Whether session is ongoing
- **message_count**: Number of messages
- **last_message_at**: Timestamp of last message

#### `ai_chat_messages`
Stores individual messages:
- **id**: Unique message identifier
- **wallet_address**: User's wallet address
- **session_id**: Reference to the session
- **message_text**: Message content
- **is_user_message**: true for user, false for AI
- **message_type**: Type (text, chart, analysis)

## Using the Chat Service

The `lib/chatService.ts` file provides functions to interact with chat data:

```typescript
import {
  createChatSession,
  addChatMessage,
  getChatMessages,
  getChatSessions,
  closeChatSession,
} from "@/lib/chatService";

// Create a new session
const session = await createChatSession(walletAddress, "My Chat");

// Add messages
await addChatMessage(walletAddress, sessionId, "Hello!", true, "text");
await addChatMessage(walletAddress, sessionId, "Hi there!", false, "text");

// Get messages
const messages = await getChatMessages(sessionId);

// Get all sessions
const sessions = await getChatSessions(walletAddress);

// Close session
await closeChatSession(sessionId);
```

## Security Notes

- The current RLS policies allow all reads/writes. For production, you should:
  - Integrate Supabase Auth with RainbowKit wallet sessions
  - Update RLS policies to restrict access by authenticated user ID
  - Consider using service role key for server-side operations

## Troubleshooting

- **"Failed to load activities"**: Check that your Supabase URL and anon key are correct in `.env.local`
- **"Table not found"**: Make sure you've run the `schema.sql` file in the SQL Editor
- **No data showing**: Verify your wallet address matches the `wallet_address` in the database (case-insensitive)
