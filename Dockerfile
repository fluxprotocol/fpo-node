FROM node:14-alpine

WORKDIR /usr/src/app

# Copy only required files
COPY package.json package.json
COPY yarn.lock yarn.lock
COPY tsconfig.json tsconfig.json
COPY src/ src/

# Install curl for checking container health with `curl`
RUN apk --no-cache add curl

RUN yarn
RUN yarn build

CMD [ "yarn", "start" ]
