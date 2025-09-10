  FROM nginx:alpine

  COPY apps/frontend/dist /usr/share/nginx/html
  COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
  EXPOSE 3000
  CMD ["nginx", "-g", "daemon off;"]
