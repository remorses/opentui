FROM debian:bookworm-slim
WORKDIR /app
COPY dist/server-linux /app/server
RUN chmod +x /app/server
ENV PORT=3001
EXPOSE 3001
CMD ["/app/server"]
