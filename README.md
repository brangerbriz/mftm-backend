

## Installing Dependencies
```bash
# install the ZeroMQ development files
sudo apt-get update
sudo apt-get install libzmq3-dev

# install the npm modules
npm install
```

## Generate SSL key pair

For security reasons, we haven't included keys in the `ssl/` folder. Create some once you've cloned:

```bash
openssl req -x509 -sha256 -nodes -days 365 -newkey rsa:2048 -keyout ssl/private.key -out ssl/certificate.crt
```