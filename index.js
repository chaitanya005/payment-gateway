const express = require("express");
const app = express();
var cors = require("cors");

app.use(cors());
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

app.get("/", (req, res) => {
  res.send("Running....");
});

var https = require("https");

var checksum = require("./PaytmChecksum");

app.get("/payment", (req, res) => {
  // console.log(req);
  var paytmParams = {
    MID: "WzotxY58284191647962",
    WEBSITE: "WEBSTAGING",
    INDUSTRY_TYPE_ID: "Retail",
    CHANNEL_ID: "WEB",
    ORDER_ID: req.query.orderId,
    CUST_ID: "CS011P002",
    MOBILE_NO: req.query.phone_number,
    EMAIL: req.query.email,
    TXN_AMOUNT: req.query.amount,
    CALLBACK_URL: "https://paytm-payment-gateway.herokuapp.com/callback",
    // CALLBACK_URL: "http://localhost:7000/callback",
  };

  checksum
    .generateSignature(paytmParams, "6M5&O4LmLmlyr2gI")
    .then(function (reschecksum) {
      /* paytmParams.head = {
        clientId: "C11",
        version: "v1",
        signature: checksum,
      }; */
      console.log("/payment", reschecksum);

      var isValid = checksum.verifySignature(
        paytmParams,
        "6M5&O4LmLmlyr2gI",
        reschecksum
      );

      if (isValid) {
        console.log("vald");
      } else {
        console.log("not valid");
      }

      var params = {
        ...paytmParams,
        CHECKSUMHASH: reschecksum,
      };
      res.json(params);
    })
    .catch((err) => console.log("wror", err));
});

app.post("/callback", (req, res) => {
  var paytmChecksum = "";
  var received_data = req.body;
  console.log("/callback", req.body);

  var paytmParams = {};
  for (var key in received_data) {
    if (key == "CHECKSUMHASH") {
      paytmChecksum = received_data[key];
    } else {
      paytmParams[key] = received_data[key];
    }
  }

  var isValidChecksum = checksum.verifySignature(
    paytmParams,
    "6M5&O4LmLmlyr2gI",
    paytmChecksum
  );

  if (isValidChecksum) {
    console.log("Checksum Matched");

    var paytmParams = {};

    paytmParams.body = {
      mid: received_data["MID"],
      orderId: received_data["ORDERID"],
    };

    checksum
      .generateSignature(JSON.stringify(paytmParams.body), "6M5&O4LmLmlyr2gI")
      .then(function (checksum) {
        paytmParams.head = {
          signature: checksum,
        };

        var post_data = JSON.stringify(paytmParams);

        var options = {
          // hostname: "securegw-stage.paytm.in",

          /* for Production */
          hostname: "securegw.paytm.in",

          port: 443,
          path: "/v3/order/status",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": post_data.length,
          },
        };

        var response = "";
        var post_req = https.request(options, function (post_res) {
          post_res.on("data", function (chunk) {
            response += chunk;
          });

          post_res.on("end", function () {
            console.log("Response: ", response);
            if (
              JSON.parse(response).body.resultInfo.resultStatus ===
              "TXN_FAILURE"
            ) {
              let resultMsg = JSON.parse(response).body.resultInfo.resultMsg;
              let orderId = JSON.parse(response).body.orderId;
              res.redirect(
                `https://spontstore.com/order/failure?orderId=${orderId}&result_msg=${resultMsg}`
              );
            } else if (
              JSON.parse(response).body.resultInfo.resultStatus ===
              "TXN_SUCCESS"
            ) {
              let resultMsg = JSON.parse(response).body.resultInfo.resultMsg;
              let orderId = JSON.parse(response).body.orderId;
              let txn_amount = JSON.parse(response).body.txnAmount;
              res.redirect(
                `https://spontstore.com/order/confirm?orderId=${orderId}&result_msg=${resultMsg}&txn_amount=${txn_amount}`
              );
            }
          });
        });

        post_req.write(post_data);
        post_req.end();
      });
  } else {
    console.log("NOt Matched");
    res.json({
      MESSAGE: "PLEASE! STOP MESSING AROUND PAYMENT GATEWAY",
    });
  }
});

const port = process.env.PORT || 7000;
app.listen(port, () => console.log("listening at ", port));
