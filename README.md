## Installation
- NodeJs (6.11.0 or newer)
- MongoDB Community Server (https://docs.mongodb.com/getting-started/shell/tutorial/install-mongodb-on-windows/)
- run `npm install`
- run `npm start`


## queries

extracting all playlist names
```
db.getCollection('tracks').aggregate([
  {$unwind:"$playlists"},
  {$group:{_id:null, p: {$addToSet : "$playlists.name"} }},
  {$project:{_id:0, playlist: "$p"}}
])
```
