# Sparkz.TV ⚡

Underground Live Streaming platform for pirate radio DJs, electronic music producers, and live broadcasting.

## Features

- 🎧 **Live Audio & Video Streaming**: Powered by Livepeer for ultra-low latency broadcasting.
- 💬 **Interactive Live Chat**: Real-time chat with custom emotes, badges, and high-energy reactions.
- 📻 **Multi-Genre Channels**: Drum & Bass, Jungle, Acid Techno, House, Dub, Reggae, and Old Skool.
- ⚡ **Watts & Tipping**: Support your favorite underground DJs and broadcasters.
- 📅 **Broadcast Schedules**: View upcoming live sets and recurring DJ slots.
- 📱 **Responsive Design**: Modern UI styled with Tailwind CSS, Phosphor Icons, and Radix UI.

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Radix UI, Lucide & Phosphor Icons
- **Backend**: Express (Node.js/TypeScript), WebSockets (`ws`), JWT Auth
- **Streaming**: Livepeer Studio API integration
- **Database**: Firebase Firestore with REST/Admin SDK sync and in-memory store

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/sparkztv.git
   cd sparkztv
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Copy `.env.example` to `.env` and fill in any necessary credentials:
   ```bash
   cp .env.example .env
   ```

4. Run development server:
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   ```

6. Start production server:
   ```bash
   npm run start
   ```

## License

MIT
