FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY server.mjs jobs.mjs join.mjs pipeline.mjs test-a.mp4 test-b.mp4 ./
EXPOSE 8080
CMD ["node", "server.mjs"]
