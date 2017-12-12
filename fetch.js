const MongoClient = require('mongodb').MongoClient;
const request = require('request');

const assert = require('assert');

const config = require('./config.json');
const countries = require('./countries.json');

let db;
let token;

let checkError = (err) => {
    if (err != null) {
        console.error(err);
        throw err;
    }
};

let existingIds = [];

let queue = [];


let runQueue = () => {
    console.log(`queue size: ${queue.length}`);
    let item = queue.pop();

    if (item !== undefined) {

        try {
            item(() => {
                runQueue();
            })
        }
        catch (e) {
            console.log(e);
            queue.push(item);
            setTimeout(runQueue,1000);
        }
    }
};


MongoClient.connect(config.db.url, function (err, client) {
    checkError(err);
    console.log("Connected successfully to server");

    db = client.db(config.db.name);

    let options = {
        "headers": {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": "Basic " + config.spotify.token
        }, "form": {
            "grant_type": "client_credentials",
        }, timeout: 60000
    };

    request.post('https://accounts.spotify.com/api/token', options, (err, res, tokenResult) => {
        checkError(err);
        token = JSON.parse(tokenResult).access_token;

        console.log('auth successful');

        for (let country of countries) {
            queue.push((cb) => queueCountryPlaylist(cb, country));
        }

        runQueue();
    });

});

let queueCountryPlaylist = (cb, country) => {
    request.get('https://api.spotify.com/v1/browse/featured-playlists?limit=50&country=' + country, {
            "headers": {
                "Authorization": "Bearer " + token
            }
        },
        (err, res, body) => {
            checkError(err);
            let result = JSON.parse(body);

            if (result.error != null) {
                console.log(country + ": " + result.error.message);
                return;
            }

            let playlists = result.playlists.items.map(i => {
                i.country = country;
                return i;
            });

            for (let playlist of playlists) {
                queue.push((cb) => queuePlaylistTracks(cb, playlist));
            }

            cb();
        });
};

let queuePlaylistTracks = (cb, playlist) => {
    //console.log(`Playlist: ${playlist.name} Tracks: ${playlist.tracks.total}, Country: ${country}`);
    request.get(playlist.href, {
            "headers": {
                "Authorization": "Bearer " + token
            }
        },
        (err, res, tracksBody) => {
            checkError(err);
            let result = JSON.parse(tracksBody);

            let plEntry = {
                id: playlist.id,
                name: playlist.name,
                country: playlist.country
            };

            let duplicates = result.tracks.items.map(i => i.track.id).filter(id => existingIds.indexOf(id) >= 0);


            let tracks = result.tracks.items.filter(i => existingIds.indexOf(i.track.id) < 0).map(t => {
                let result = t.track;
                result.playlists = [plEntry];

                return result;
            });

            if (tracks.length > 0) {

                //console.log(`insert ${tracks.length} items...`);

                existingIds = existingIds.concat(tracks.map(t => t.id));

                db.collection('tracks').insertMany(tracks, (err, res) => {
                    checkError(err);

                });

            }

            if (duplicates.length > 0) {
                //console.log(`update ${duplicates.length} items...`);
            }
            for (let d of duplicates) {
                db.collection('tracks').updateOne({id: d}, {
                    "$push": {
                        "playlists": plEntry
                    }
                }, (err, res) => {
                    checkError(err);
                });
            }

            cb();
        });
};