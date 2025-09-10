  FROM nginx:alpine

  # Serve the prebuilt static assets with nginx
  COPY apps/smoker/dist /usr/share/nginx/html
  COPY apps/smoker/nginx.conf /etc/nginx/conf.d/default.conf
  EXPOSE 8080
  CMD ["nginx", "-g", "daemon off;"]
