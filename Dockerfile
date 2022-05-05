FROM node:14-alpine

WORKDIR /usr/src/app

# Copy only required files
COPY package.json package.json
COPY yarn.lock yarn.lock
COPY tsconfig.json tsconfig.json
COPY src/ src/

# Install curl for checking container health with `curl`
RUN apk --no-cache add curl

# Install tools for node-gyp (required by MacOS)
RUN apk --no-cache add g++ gcc libgcc libstdc++ linux-headers make python3

RUN yarn
RUN yarn build

CMD [ "yarn", "start" ]
