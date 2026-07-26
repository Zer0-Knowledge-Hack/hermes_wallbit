FROM node:20-alpine

# Instalar herramientas necesarias para Baileys, SSL y zona horaria
RUN apk update && apk add --no-cache bash curl git tzdata ca-certificates

WORKDIR /app

# Copiar archivos de gestión de paquetes
COPY package*.json ./

# Instalar dependencias de producción y desarrollo (para asegurar herramientas de construcción si hicieran falta)
RUN npm install

# Copiar el resto del código fuente y recursos estáticos
COPY . .

# Crear y dar permisos de lectura/escritura a las carpetas locales donde Baileys persistirá la sesión en el VM
RUN mkdir -p auth data && chmod -R 777 auth data

# Puerto estándar para Cloudflare Containers
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

# Iniciar la aplicación
CMD ["npm", "start"]
