const { MongoClient, ServerApiVersion, MongoRuntimeError, ObjectId } = require('mongodb');
const express = require('express')
const app = express()
const cors = require('cors');
const port = process.env.PORT || 5000;
// const path = require('path')
require('dotenv').config();
var jwt = require('jsonwebtoken');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

//middle ware 
app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.wxobf.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });



function verifyJWT(req, res, next) {
  console.log('abc');
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'unAuthorized access' });
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {

    if (err) {
      return res.status(403).send({ message: 'forbidden access' })
    }
    console.log(decoded); //bar 
    req.decoded = decoded;
    next();
  });
}




async function run() {
  try {
    await client.connect();
    // console.log('database connected');
    const servicesCollection = client.db('doctors-portal').collection('services');
    const bookingCollection = client.db('doctors-portal').collection('booking');
    const userCollection = client.db('doctors-portal').collection('users');
    const doctorCollection = client.db('doctors-portal').collection('doctors');
    const paymentsCollection = client.db('doctors-portal').collection('payments');


    /* calling database and get the data  */
    app.get('/services', async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query).project({name: 1});
      const services = await cursor.toArray();
      res.send(services);
    })

    /* user information post process (update data) */
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = { $set: user };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      /* jwt process */
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ result, token });
    })

    /* 
    ============ Warning =============== 
    this is not the proper way to query 
    after learning more about mongodb use aggregate lookup pipeline match group
    
    search google mongodb aggregate
    */
    app.get('/available', async (req, res) => {
      const date = req.query.date;

      //step 1: get all services  
      const services = await servicesCollection.find().toArray();

      //step 2: get the booking of that day
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      //step 3: for each service find bookings for that service
      services.forEach(service => {
        // find bookings for that service output : [{}, {}, {}]
        const serviceBooking = bookings.filter(book => book.treatment === service.name);
        // select slots for the service bookings ['' , '' , '']
        const bookedSlots = serviceBooking.map(book => book.slot);
        // select those slots that are not in bookSlots
        const available = service.slots.filter(slot => !bookedSlots.includes(slot))
        service.slots = available;
      })

      res.send(services);

    })





    // For getting dashboard data 
    app.get('/booking', verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        res.send(bookings);
      }
      else {
        return res.status(403).send({ message: 'forbidden access' });
      }
    })


    /* get method for payment process */
    app.get('/booking/:id', verifyJWT,  async(req, res) =>{
      const id = req.params.id;
      const query = {_id: ObjectId(id)};
      const booking = await bookingCollection.findOne(query);
      res.send(booking);
    })
    /* 
    API naming convention 
      app.get('/booking') // get all booking in this collection or get mere than one or by filter
      app.get('/booking/:id') //  get a specific booking 
      app.post('/booking')// add a new booking
      app.patch('/booking/:id/) // update a specific data 
      app.put('/booking':id) // upsert =>  if have a user then update user and have no user then create user
      app.delete('/booking/:id') // delete a specific data 
     */

    /* for a client booking service */
    app.post('/booking', async (req, res) => {
      const booking = req.body;
      // booking condition for one booking per user per treatment per day
      const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists })
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    })


    /* patch for booking (for stripe data update) */

    app.patch('/booking/:id', verifyJWT, async(req, res) =>{
      const id = req.params.id;
      const payment = req.body;
      const filter = {_id: ObjectId(id)};
      const updateDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,

        }
      }
      const result = await paymentsCollection.insertOne(payment);
      const updatedBooking = await bookingCollection.updateOne(filter, updateDoc);
      res.send(updateDoc)

    })

    /* get method for all user data loading  */
    app.get('/user', async (req, res) => {
      const users = await userCollection.find({}).toArray();
      console.log(users);
      res.send(users);
    })


    /* Make a admin from user  */
    app.put('/user/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester });
      if (requesterAccount.role === 'admin') {
        const filter = { email: email };
        const updateDoc = { $set: { role: 'admin' }, };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send({ result });
      }
      else {
        res.status(403).send({ message: 'forbidden' })
      }

    })


    app.get('/admin/:email', async(req, res) =>{
      const email = req.params.email;
      const user = await userCollection.findOne({email: email});
      const isAdmin = user.role  === 'admin';
      res.send({admin: isAdmin});
    })



    app.post('/doctor', async(req, res) =>{
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    })

    /* payment method process */
    app.post('/create-payment-intent', verifyJWT,  async(req, res)=>{
      const service = req.body;
      const price = service.price;
      const amount =  price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']

      })
      res.send({clientSecret: paymentIntent.client_secret})


    })

  }
  finally {

  }
}
run().catch(console.dir)


app.get('/', (req, res) => {
  res.send('welcome doctors portal');
})

app.listen(port, () => {
  console.log(`Doctors portal listening on port ${port}`)
}) 