const { MongoClient, ServerApiVersion, MongoRuntimeError } = require('mongodb');
const express = require('express')
const app = express()
const cors = require('cors');
const port = process.env.PORT|| 5000;
// const path = require('path')
require('dotenv').config();

//middle ware 
app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.wxobf.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run(){
    try{
        await client.connect();
        // console.log('database connected');
        const servicesCollection = client.db('doctors-portal').collection('services');

        /* calling database and get the data  */
        app.get('/services', async(req, res) =>{
            const query = {};
            const  cursor = servicesCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        })

        /* 
        API naming convention 
          app.get('/booking') // get all booking in this collection or get mere than one or by filter
          app.get('/booking/:id') //  get a specific booking 
          app.post('/booking')// add a new booking
          app.patch('/booking/:id/) // update a specific data 
          app.delete('/booking/:id') // delete a specific data 
         */

          app.post('/booking', async(req, res) =>{
            const booking =  req.body;
            const result = await servicesCollection.insertOne(booking);
            res.send(result);
          })



    }
    finally{

    }
}
run().catch(console.dir)


app.get('/', (req, res) => {
  res.send('welcome doctors portal');
})

app.listen(port, () => {
  console.log(`Doctors portal listening on port ${port}`)
}) 