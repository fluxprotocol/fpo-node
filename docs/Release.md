# FPO release instructions

Install and build:

```console
$ yarn
$ yarn build
```

Increase package version using `standard-version`:

```console
$ npx standard-version
```

Push new tags into Github repository:

```console
$ git push --follow-tags origin main
```

Build docker image (tag `latest`):

```console
$ docker build . -t fluxprotocol/fpo-node --platform=linux/amd64
````

Tag docker image with the current version (`X.Y.Z`):

```console
$ docker tag fluxprotocol/fpo-node:latest fluxprotocol/fpo-node:vX.Y.Z
```

Push new docker image to DockerHub (login is required):

```console
$ docker push fluxprotocol/fpo-node:latest
$ docker push fluxprotocol/fpo-node:vX.Y.Z
```

Et voilá! Everything should be fine! ;-)
