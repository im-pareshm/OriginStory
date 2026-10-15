import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3001;

createApp().listen(PORT, () => {
  console.log(`Repo Museum API listening on http://localhost:${PORT}`);
});
