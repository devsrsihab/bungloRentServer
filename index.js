const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const morgan = require("morgan");
const stripe = require("stripe")(process.env.STRIPE_SK);
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 8000;
const cors = require("cors");

// middleware
const corsOptions = {
  origin: ["https://bunglorent.web.app","http://localhost:5173"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(express.json());
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(morgan("dev"));

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  console.log(token);
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(
  "mongodb+srv://bunglorent:nl4VybIkUQv9pdgu@cluster0.hteerze.mongodb.net/?retryWrites=true&w=majority",
  {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  }
);
async function run() {
  try {
    // all db collections
    const db = client.db("bunglodb");
    // user collection
    const usersCollection = db.collection("users");
    // shop collection
    const shopCollection = db.collection("shops");
    // shop collection
    const buildingCollection = db.collection("buildings");
    // checkouts collection
    const cartCollection = db.collection("carts");
    // checkouts collection
    const saleCollection = db.collection("sales");
    // checkouts collection
    const paymentCollection = db.collection("payments");




    // auth related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      console.log("I need a new jwt", user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
        console.log("Logout successful");
      } catch (err) {
        res.status(500).send(err);
      }
    });


    // ====================================
    //               SHOP
    // ====================================
    // 1. MAKE A shops
    app.post("/shops/:email", async (req, res) => {
      const shops = req.body;
      const email = req.params.email;
      const shopOwnerEmail = req.params.email;
      const query = { shopOwnerEmail: email };
      const isExist = await shopCollection.findOne(query);
      if (isExist) return res.status(409).send(isExist);

      // store the data in collection
      const result = await shopCollection.insertOne(shops);
      // 1. user data to update
      // for done this need 3 method , filter, update , options
      const userDataToUpsert = {
        role: "manager",
        shopId: result.insertedId.toHexString(),
        shopName: shops.shopName,
        shopLogo: shops.shopLogo,
      };
      // 2. user data filter
      const userFilter = { email: shops.shopOwnerEmail };
      // 3. options
      const options = { upsert: true };
      // 4. udpate operation for userdata
      const userUpdate = {
        $set: userDataToUpsert,
      };
      const userResult = await usersCollection.updateOne(
        userFilter,
        userUpdate,
        options
      );
      // serve the data
      res.status(200).send(result);
    });

    // 2. UPDATE THE SHOP AFTER PAYMENT
    app.patch('/shops', async (req, res) => {
      const email = req.body.email;
      const limit = req.body.limit
      console.log(email, limit);
      const filter = { shopOwnerEmail: email };
      // find if the shop exist
      const isExist = await shopCollection.findOne(filter);
      if (!isExist) return res.status(404).send("Shop not found");
      // if exist then update
      const update = { $set: { limit: limit } };
      const result = await shopCollection.updateOne(filter, update);
      res.send(result);
    })

    // 3. GET ALL SHOPS
    app.get('/shops', async(req, res)=>{
      const query = {}
      const shops = await shopCollection.find(query).toArray()
      res.send(shops)
    })


    // ====================================
    //             BUILDING CRUD
    // ====================================

    //  1. MAKE A BUILDING
    app.post("/buildings/:email", async (req, res) => {
      const buildings = req.body;
      const email = req.params.email;
      //l need i to insert this data in building collection
      // 1. Shop-Id
      // 2. SHop-Name
      // 3. user-Email
      // 4. Product AddedDate
      // 5. SaleCount ==> SellingPrice = building Price + (7.5% Tax) + (profit percentage)

      // ====== solutions ========
      // 2. user data filter
      const query = { shopOwnerEmail: email };
      const shopData = await shopCollection.findOne(query);
      if (!shopData) return res.status(404).send("Shop not found");
      const shopId = shopData._id.toHexString();
      const shopName = shopData.shopName;
      const shopOwnerEmail = shopData.shopOwnerEmail;
      const buildingAddedDate = new Date();
      const saleCount = 0;
      const allData = {
        ...buildings,
        shopId,
        shopName,
        shopOwnerEmail,
        buildingAddedDate,
        saleCount,
      };
      console.log(allData);

      if (shopData.limit === 0) return res.status(403).send("Limit reached");

      // store the data in collection
      const result = await buildingCollection.insertOne(allData);
      //  after building insert -1 limit from shop limit collection
      const updatedShop = await shopCollection.findOneAndUpdate(
        { _id: new ObjectId(shopId) },
        { $inc: { limit: -1 } }, // Decrement quantity by 1
        { returnOriginal: false }
      );
      // serve the data
      res.status(200).send(result);
    });

    // 2. GET USER SPECIFICE BUILDING
    app.get("/buildings/:email", async (req, res) => {
      // get the id
      const email = req.params.email;
      // query for  category
      const query = { shopOwnerEmail: email };
      const buildings = await buildingCollection.find(query).toArray();
      res.send(buildings);
    });

    // 3. EDIT building
    app.get("/building/:id", async (req, res) => {
      // get the id
      const id = req.params.id;
      // query for  category
      const query = { _id: new ObjectId(id) };
      const building = await buildingCollection.findOne(query);
      res.send(building);
    });

    //  4. update the building
    app.put("/building/:id", async (req, res) => {
      const id = req.params.id;
      const building = req.body;
      console.log(building);
      // filter for the product with id
      const filter = { _id: new ObjectId(id) };
      // create product data if id not matching
      const options = { upsert: true };
      // update the product data
      const updateBuilding = {
        $set: {
          buildingtName: building.buildingtName,
          buildingImage: building.buildingImage,
          buildingQuantity: building.buildingQuantity,
          buildingLocation: building.buildingLocation,
          productionCost: building.productionCost,
          profiteMargin: building.profiteMargin,
          discount: building.discount,
          buildingDescription: building.buildingDescription,
        },
      };
      // update the data
      const result = await buildingCollection.updateOne(
        filter,
        updateBuilding,
        options
      );
      // serve the data
      res.send(result);
    });

    // 5. DELETE building
    app.delete("/building/:id", async (req, res) => {
      const id = req.params.id;
      // filter for the product with id
      const query = { _id: new ObjectId(id) };
      const result = await buildingCollection.deleteOne(query);
      res.send(result);
    });

    // 6. BULDING STATUS CHANGE AFTER ORDER
    app.patch('/building/ordered', async(req, res)=>{
      const ordered = req.body.idAndQuantity;
      console.log(ordered);

      const options = { upsert: true };

      const updates = ordered.map(({ productId, qantity }) => ({
        filter: { _id: new ObjectId(productId) },
        update: { $set: { sold: true, soldDate: new Date() } },
      }));

      // result
      const results = [];

      for (const updateObj of updates) {
        const result = await buildingCollection.updateOne(
          updateObj.filter,
          updateObj.update,
          options
        );
        results.push(result);
      }

      res.status(200).send(results);
    })

    // ====================================
    //             CARTS
    // ====================================

    //  1. MAKE A PRODUCT CART
    app.post("/carts/:email/:id", async (req, res) => {
      const carts = req.body;
      const email = req.params.email;
      const id = req.params.id;

      // ====== data storing ========
      // 2. user data filter
      const query = { productId: id, userEmail: email };
      const isExist = await cartCollection.findOne(query);

      console.table(isExist);

      if (isExist) return res.status(409).send(isExist);

      // store the data in collection
      const result = await cartCollection.insertOne(carts);
      // serve the data
      res.status(200).send(result);
    });

    // 2. GET USER SPECIFICE BUILDING
    app.get("/carts/:email", async (req, res) => {
      // get the id
      const email = req.params.email;
      // query for  category
      const query = { userEmail: email };
      // fetch the data
      const carts = await cartCollection.find(query).toArray();
      // serve the data
      res.send(carts);
    });

    // 3. DELETE building
    app.delete("/carts", async (req, res) => {
      const idsAndEmail = req.body.idsAndEmail;

      // filter for the product with id
      const deleteCarts = idsAndEmail.map(({ _id, userEmail }) => ({
        filter: { _id: new ObjectId(_id), userEmail: userEmail },
      }));

      // result
      const results = [];
      for (const deleteCart of deleteCarts) {
        const result = await cartCollection.deleteOne(deleteCart.filter);
        results.push(result);
      }
      res.status(200).send(results);
    });

    // ====================================
    //             CHECKOUT
    // ====================================
    app.put("/checkout/:email", async (req, res) => {
      const checkout = req.body.idAndQuantity;
      console.log(checkout);

      // 1. make a filter for upate building data
      // const filter = {

      const options = { upsert: true };

      const updates = checkout.map(({ productId, quantity }) => ({
        filter: { _id: new ObjectId(productId) },
        update: { $inc: { buildingQuantity: -quantity, saleCount: 1 } },
      }));

      // result
      const results = [];

      for (const updateObj of updates) {
        const result = await buildingCollection.updateOne(
          updateObj.filter,
          updateObj.update,
          options
        );
        results.push(result);
      }

      res.status(200).send(results);
    });

    // ====================================
    //             sale
    // ====================================
    app.post("/sale", async (req, res) => {
      const sale = req.body;
      // store the data in collection
      const result = await saleCollection.insertOne(sale);
      // serve the data
      res.status(200).send(result);
    });

    app.get("/sales/:shopid", async (req, res) => {
      // get the id
      const shopid = req.params.shopid;
      // query for  shopId
      const query = { ownerShopId: shopid };
      // store the data in collection
      const result = await saleCollection.find().toArray();
      console.log(result);
      // serve the data
      res.status(200).send(result);
    });

    // ====================================
    //             PAYMENT
    // ====================================
    app.post("/create-payment-intent", async (req, res) => {
      const price = req.body.price;
      const amount = parseInt(price * 100);
      // if no price  or 0
      if (!price || amount < 1) return;
      // make a paymen tintnet
      const { client_secret } = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      // send response
      res.send({ clientSecret: client_secret });
    });

    // save payment info in db
    app.post("/payments", async(req, res)=>{
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    })

    

    // Save or modify user email, status in DB
    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email: email };
      const options = { upsert: true };
      const isExist = await usersCollection.findOne(query);
      console.log("User found?----->", isExist);
      if (isExist) return res.send(isExist);
      const result = await usersCollection.updateOne(
        query,
        {
          $set: { ...user, timestamp: Date.now() },
        },
        options
      );
      res.send(result);
    });
    // update admin income
    app.patch('/users', async (req, res) => {
      const income = req.body.income
      const filter = { role:'admin' };
      // find if the shop exist
      const isExist = await usersCollection.findOne(filter);
      if (!isExist) return res.status(404).send("Shop not found");
      // if exist then update
      const update = { $set: { income: income } };
      const result = await usersCollection.updateOne(filter, update);
      res.send(result);
    })

    // get all user
    app.get('/users/:email',async(req,res)=>{
      const email = req.params.email;
      const query = {email:email}
      const users = await usersCollection.findOne()
      res.send(users)
    })




    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from BungloRent Server..");
});

app.listen(port, () => {
  console.log(`BungloRent is running on port ${port}`);
});
