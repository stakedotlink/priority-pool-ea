FROM node:16 as builder
WORKDIR /home/node/app

COPY yarn.lock .
COPY package.json .
RUN yarn

COPY . .
RUN yarn build

CMD ["yarn", "start"]
