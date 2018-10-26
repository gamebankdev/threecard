const gamebank = require("gamebank");
const fs = require("fs");
const request = require("axios");
const MongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;
const config = require("config").get("Config");

const mongoLink = 'mongodb://test:123456@192.168.1.126:27017';
var mongo_client;
var mongo_db;

gamebank.api.setOptions({ url: config.gamebank.server });
gamebank.config.set("address_prefix", config.gamebank.address_prefix);
gamebank.config.set("chain_id", config.gamebank.chain_id);

const db_connect = (callback) => {
  MongoClient.connect(mongoLink, function(err,client){
    if(err){
      console.log("db_connect Error:",err);
    }
    else {
      mongo_client = client;
      mongo_db = mongo_client.db("contract_log");
      console.log("db_connect OK");
      if(callback)
        callback(mongo_db);
    }
  });
}

const db_close = () => {
  mongo_db.close();
  mongo_client.close();
}

const db_get_global_properties = (property_name, callback) => {
  const collection = mongo_db.collection("__global_properties__");
  collection.findOne({'name':property_name}, function(err,result) {
    if(err){
      console.log("db_get_global_properties",property_name, "Error:", err);
    }
    else {
      console.log("db_get_global_properties",property_name, result);
      if(result == null)
        result = {'name':property_name, 'value':1};
      if(callback)
        callback(result.value);
    }
  });
}

const db_set_global_properties = (property_name, property_value) => {
  return new Promise( (resolve,reject) => {
    const collection = mongo_db.collection("__global_properties__");
    collection.replaceOne({'name':property_name}, {'name':property_name, 'value':property_value}, {upsert:true}, function(err,result) {
      if(err){
        console.log("db_set_global_properties",property_name, "property_value:",property_value,"Error:", err);
        reject(err);
      }
      else {
        //console.log("db_set_global_properties",property_name, property_value);
        resolve(result);
      }
    });
  } );
}

const db_insert_contract_log_promise = (contract_name, key, value) => {
  return new Promise((resolve,reject)=>{
    try {
      const collection = mongo_db.collection(contract_name);
      // value : array [a, b, c]
      // key:k col1:a col2:b col3:c
      let insert_obj = {key:key};
      for(var i=0; i<value.length; i++){
        insert_obj["col"+(i+1)] = value[i];
      }
  
      collection.insertOne(insert_obj, function(err,result){
        if(err){
          console.log("插入失败")
          console.log("db_insert_contract_log Error:",err);
          reject(err);
        }
        else {
          console.log("添加数据成功")
          //console.log("result:",result);
          resolve(result);
        }
      });
    } catch (e) {
      console.log("exception:", e);
      reject(e);
    }
  });
}


//请求链上最新的区块
const request_head_block_number = async read_head_block_number => {
    const {
      head_block_number
    } = await gamebank.api.getDynamicGlobalPropertiesAsync();
    global.last_head_block_number = head_block_number;
  
    requestBlockChain(read_head_block_number);
  
    global.timer = setInterval(async () => {
      const {
        head_block_number
      } = await gamebank.api.getDynamicGlobalPropertiesAsync();
  
      global.last_head_block_number = head_block_number;
      requestBlockChain(head_block_number);
    }, 3000);
  };

  //获取当前最新的初始合约块信息
const requestBlockChain = async head_block_number => {
    //console.log(head_block_number)
    try {
      if (head_block_number > global.last_head_block_number) {
        return false;
      }
      var formData = {
        id: 0,
        jsonrpc: "2.0",
        method: "call",
        params: ["condenser_api", "get_contract", [head_block_number]]
      };
      const { data = {} } = await request({
        url: config.gamebank.server,
        method: "POST",
        data: formData,
        headers: {
          "Content-type": "application/json"
        }
      });
      let result = data.result;
      if (result == null || result == undefined) {
        result = {};
      }
      const { transactions = [] } = result;
  
      transactions.forEach(ele => {
        const { operations = [] } = ele;
          operations.forEach(async (value = []) => {
            const [contract_log, info] = value;
            if (contract_log == "contract_log") {
              const { name,key,data = JSON.stringify({}) } = info; // name:contract_name
              try {
                const value = JSON.parse(data); // data: array
                console.log(name,key,value);
                var ret = await db_insert_contract_log_promise(name,key,value);
              }
              catch(e){
                console.log("exception", e);
                console.log("name", name);
                console.log("data", data);
              }
            }
          });
      });
      var ret = await db_set_global_properties("last_sync_head_block_number", head_block_number);
      return requestBlockChain(head_block_number + 1);
    } catch (err) {
      //request_head_block_number(read_file_contract_number());
      fs.writeFileSync("./file/err.txt", JSON.stringify(err));
      console.log("err", err);
    }
  };

const start_sync_func = () => {
  db_connect( function(db) {
    db_get_global_properties("last_sync_head_block_number", function(last_sync_head_block_number){
      console.log("last_sync_head_block_number", last_sync_head_block_number);
      request_head_block_number(last_sync_head_block_number);
    });
  });
}

module.exports = {
    start_sync : start_sync_func
}