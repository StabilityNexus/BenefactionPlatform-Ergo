FROM node:20 AS builder
COPY service /app
WORKDIR app
RUN npm install
RUN ls -l .
RUN ls -l ./src
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html