import { Server } from "socket.io";

export function createSocketServer(httpServer: import("http").Server) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*"
    }
  });

  io.on("connection", (socket) => {
    socket.on("join", (room: string) => {
      socket.join(room);
    });
    socket.on("leave", (room: string) => {
      socket.leave(room);
    });
  });

  return io;
}
