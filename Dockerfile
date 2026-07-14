FROM us-east4-docker.pkg.dev/sym-prod-mr-tools-01/base-docker-us-east4/node:22-bookworm

WORKDIR /www

COPY package.json .
COPY src ./src

RUN npm install
RUN npm install -g concurrently

EXPOSE 3000/tcp

CMD npx concurrently "npm run dev" "npm run frontend"
