var http = "http://47.94.21.121:5001/";
window.getRequest = function(url) {
  return fetch(`${http}${url}`)
    .then(function(response) {
      return response.json();
    })
    .then(function(myJson) {
       return myJson.data
    })
    .catch((error)=>{
      console.log(error)
    })
};
