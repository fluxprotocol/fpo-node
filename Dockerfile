FROM node:14-alpine

WORKDIR /usr/src/app

COPY . ./

RUN apk --no-cache add g++ gcc libgcc libstdc++ linux-headers make python3

RUN yarn global add --quiet node-gyp

RUN yarn

RUN yarn build

CMD [ "yarn", "start" ]