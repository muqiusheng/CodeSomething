FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:stable-alpine
LABEL codesomething.deployment=true
RUN sed -i -E 's/^worker_processes +.+;/worker_processes 2;/' /etc/nginx/nginx.conf
COPY deployment/nginx.conf /etc/nginx/templates/codesomething.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
