const cheerio = require('cheerio');
const request = require('request');
const fs = require('fs');
const { URL } = require('url');
const EventEmitter = require('events');

const loadURL = url =>
  new Promise((resolve, reject) =>
    request.get(url.toString(), (err, response, body) => {
      if (err || response.statusCode !== 200) {
        reject(
          new Error(`Error fetching URL ${url.toString()} (${err.statusCode || err.message})`)
        );
        return;
      }
      resolve(body);
    })
  );

class Stream extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
  }

  download(filename) {
    let bytesTotal = 0;
    let bytesDownloaded = 0;

    request
      .get(this.url)
      .on('response', res => {
        if (res.statusCode !== 200) {
          throw new Error(`Error downloading stream from ${this.url} (${res.statusCode})`);
        }
        bytesTotal = Number.parseInt(res.headers['content-length'], 10);
        this.emit('response', {
          bytesTotal
        });
      })
      .on('data', chunk => {
        bytesDownloaded += chunk.length;
        this.emit('progress', {
          chunkBytes: chunk.length,
          bytesTotal,
          bytesDownloaded
        });
      })
      .on('error', err => {
        throw new Error(`Error downloading media: ${err.statusCode}`);
      })
      .pipe(fs.createWriteStream(filename));
  }
}

class RadioEins {
  constructor(showUrl) {
    this.showUrl = new URL(showUrl);
    this.baseUrl = `${this.showUrl.protocol}//${this.showUrl.host}`;
  }

  makeAbsoluteURL(url) {
    return new URL(url, this.baseUrl);
  }

  getInfo() {
    return loadURL(this.showUrl).then(html => {
      const $ = cheerio.load(html);
      const playerInfo = JSON.parse(
        $('.playerdownload')
          .children('div[data-jsb]')
          .first()
          .attr('data-jsb')
      );

      const url = this.makeAbsoluteURL(playerInfo.media);
      return loadURL(url).then(res => {
        const json = JSON.parse(res);
        // eslint-disable-next-line no-underscore-dangle
        const streams = json._mediaArray[0]._mediaStreamArray.map(
          stream => new Stream(stream._stream) // eslint-disable-line no-underscore-dangle
        );
        return {
          title: json.rbbtitle,
          streams
        };
      });
    });
  }
}

module.exports = RadioEins;
