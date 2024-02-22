const express = require('express');
const { createServer } = require('http');
const { join } = require('path');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const redisAdapter = require('socket.io-redis'); // Import socket.io-redis

async function main() {
  const db = await open({
    filename: 'chat.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_offset TEXT UNIQUE,
      content TEXT
    );
  `);

  const app = express();
  const server = createServer(app);
  const io = new Server(server);


  io.adapter(redisAdapter({ host: '127.0.0.1', port: 6379 }));

  app.use('/', require('../routes/api'));

  io.on('connection', async (socket) => {
    socket.on('chat message', async (msg) => {
      let result;
      try {
        result = await db.run('INSERT INTO messages (content) VALUES (?)', msg);
      } catch (e) {
        return;
      }
      io.emit('chat message', msg, result.lastID);
    });

    if (!socket.recovered) {
      try {
        await db.each('SELECT id, content FROM messages WHERE id > ?',
          [socket.handshake.auth.serverOffset || 0],
          (_err, row) => {
            socket.emit('chat message', row.content, row.id);
          } 
        )
      } catch (e) {
      }
    }
  });

  server.listen(3000, () => {
    console.log('server running at http://localhost:3000');
  });
}

main();
