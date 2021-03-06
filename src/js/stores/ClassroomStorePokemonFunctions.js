var FirebaseStore = require('./FirebaseStore');
var firebaseRef = FirebaseStore.getDb();
var pokemonAPIUtils = require('../utils/PokemonWebAPIUtils');
var ClassroomStore = require('./ClassroomStore');


var getNewPokemon = function(studentId, classId, specificPokemonAPIUrl, currentLevel) {
  // if no specific pokemon url was passed in, set the value to null
  var specificspecificPokemonAPIUrl = specificPokemonAPIUrl || null
  // if no level was passed in (if this call is not the result of evolving) set level to 1
  var currentLevel = currentLevel || 1;
  var spriteUrl;
  var defaultPokemonProfile = {level: currentLevel, currentExp: 1, expToNextLevel: 20}
  var pokemonDirectory = {};
  pokemonAPIUtils.getNewPokemonFromServer(specificPokemonAPIUrl).then(function(pokemonData) {
    spriteUrl = pokemonData.sprites[0].resource_uri
    pokemonAPIUtils.getPokemonSprite(spriteUrl).then(function(pokemonSpriteData) {
      
      // create a _pokemon data object and store only the necessary values
      // if we need to access more values from the pokemon API, include them ehre
      pokemonDirectory._pokemonData = {};
      pokemonDirectory._pokemonData.name = pokemonData.name;
      pokemonDirectory._pokemonData.evolutions = pokemonData.evolutions;
      pokemonDirectory._pokemonData.resource_uri = pokemonData.resource_uri;
      pokemonDirectory._spriteData = pokemonSpriteData;
      pokemonDirectory._spriteUrl = "http://pokeapi.co" + pokemonSpriteData.image
      pokemonDirectory.profile = defaultPokemonProfile;
      // set hasAPokemon to true to indicate this isn't dummy data
      pokemonDirectory.hasAPokemon = true;
      sendServerPokemon(studentId, classId, pokemonDirectory);
    }, function(error) {
      console.error('error getting a pokemon sprite data:', error);
      throw error
    });

  }, function(error) {
    console.error('error getting a random pokemon:', error);
    throw error
  });
};

// send the pokemon data to the firebase server for a specified student
var sendServerPokemon = function(studentId, classId, pokemonDirectory) {
  firebaseRef.child('classes/' 
                    + classId 
                    + '/students/' 
                    + studentId 
                    + '/pokemon/'
                    )
                    .set(pokemonDirectory);
}

var addExperiencePoints = function(data, classId) {
  var studentId = data.studentId
  var numberOfExperiencePointsToAdd = data.behaviorValue;
  var firebasePokemonDirectoryRef = firebaseRef.child('classes/' 
                            + classId 
                            + '/students/' 
                            + studentId
                            + '/pokemon/'
                            )
  var profileData;
  firebasePokemonDirectoryRef
    .once('value', function(pokemonDirectoryData){
      profileData = pokemonDirectoryData.val().profile;
      // if the pokemon needs to level up after adding the new experience points
      if (profileData.currentExp + numberOfExperiencePointsToAdd >= profileData.expToNextLevel) {
        // level up the pokemon
        handleLevelUp(firebasePokemonDirectoryRef, numberOfExperiencePointsToAdd, classId, studentId)
      } 
      // else if the pokemon does not need to level up
      else {
        // increase its experience points by the specified amount
        firebasePokemonDirectoryRef.child('profile').child('currentExp').transaction(function(current_value) {
          // if we are trying to decrease the experience, and the result is below zero
          if (current_value + numberOfExperiencePointsToAdd < 0) {
            // return 0 to prevent exprience going into negative
            return 0;
          } // else if the result of adding the experience points is above zero
          else {
            // add the new experience points
            return current_value + numberOfExperiencePointsToAdd

          }
        });
      }
  });

}


var handleLevelUp = function(firebasePokemonDirectoryRef, numberOfExperiencePointsToAdd, classId, studentId) {
  firebasePokemonDirectoryRef
    .once('value', function(pokemonDirectoryData){
      profileData = pokemonDirectoryData.val().profile;
      // stores the sum of the current exp and the number of points to add
      var accumulatedExp = profileData.currentExp + numberOfExperiencePointsToAdd
      var numberOfTimesToLevelUp = Math.floor(accumulatedExp / profileData.expToNextLevel)
      // stores the amount of leftover exp after leveling up
      var amountOfLeftoverExp = accumulatedExp % (profileData.expToNextLevel * numberOfTimesToLevelUp)
      // get the current level of the student's pokmon
      firebasePokemonDirectoryRef.child('profile').child('level').transaction(function(current_value) {
          var newLevel = current_value + numberOfTimesToLevelUp
          var pokemonToEvolveToUrl = checkIfNeedToEvolve(newLevel, pokemonDirectoryData)
          // if the pokemon needs to evolve
          if (pokemonToEvolveToUrl) {
            // get the pokemon's evolution
            getNewPokemon(studentId, classId, pokemonToEvolveToUrl, newLevel)
            // eject from the function so the pokemon doesn't evolve twice
            return
          } else { // else if the pokemon does not need to evolve
            // just return the pokemon's new level
            return newLevel
          }
      });
      // also set the amount of exp the student's pokemon has after leveling up
      firebasePokemonDirectoryRef.child('profile').child('currentExp').transaction(function(current_value) {
          return amountOfLeftoverExp
      });

  });
}
// if the pokemon needs to evolve
// then this function returns the URL of the pokemon to evolve to (truthy)
// else if the pokemon does not need to evolve, return null (falsey)
var checkIfNeedToEvolve = function(newLevel, pokemonDirectoryData) {
  var evolutions = pokemonDirectoryData.val()._pokemonData.evolutions
  // if the pokemon is capable of evolving into other pokemon
  if (evolutions) {
    // for each evolution
    for (var i = 0; i < evolutions.length; i++) {
      // if the current pokemon should evolve into the new pokemon by leveling up
      if (newLevel >= evolutions[i].level && evolutions[i].method === "level_up") {
        // return the api uri call for the new pokemon
        return evolutions[i].resource_uri
      }
    }
  }
  // if the pokemon is not capable of evolving into other pokemon
  // or should not currently level up
  // return null
  return null;
}

module.exports = {
  'getNewPokemon': getNewPokemon,
  'sendServerPokemon': sendServerPokemon,
  'addExperiencePoints': addExperiencePoints,
  'handleLevelUp': handleLevelUp,
}