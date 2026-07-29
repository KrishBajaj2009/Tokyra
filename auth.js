/*
    Tokyra Authentication System
    Powered by Netlify Identity

    Features:
    - Login / Signup / Logout buttons
    - Account badge
    - Global auth state events
    - User session helpers
*/


(function(){

"use strict";


if(window.TokyraAuthLoaded){
    return;
}

window.TokyraAuthLoaded = true;



function setup(){


const widget = window.netlifyIdentity;


if(!widget){

console.warn(
"Tokyra Auth: Netlify Identity unavailable."
);

return;

}



const loginBtn =
document.getElementById(
"authLoginBtn"
);


const signupBtn =
document.getElementById(
"authSignupBtn"
);


const logoutBtn =
document.getElementById(
"authLogoutBtn"
);


const badge =
document.getElementById(
"authAccountBadge"
);




function updateUI(user){


const loggedIn =
Boolean(user);



if(loginBtn)
loginBtn.style.display =
loggedIn ? "none" : "inline-flex";



if(signupBtn)
signupBtn.style.display =
loggedIn ? "none" : "inline-flex";



if(logoutBtn)
logoutBtn.style.display =
loggedIn ? "inline-flex" : "none";





if(badge){


if(loggedIn){


const name =
user.email
? user.email.split("@")[0]
: "Account";


badge.textContent =
name;


badge.style.display =
"inline-flex";


}

else{


badge.textContent =
"";


badge.style.display =
"none";


}


}




window.TokyraUser =
user || null;




document.dispatchEvent(

new CustomEvent(
"tokyra:auth",
{
detail:{
user:user || null
}
}

)

);


}





/*
BUTTONS
*/


if(loginBtn){

loginBtn.onclick =
()=>widget.open("login");

}



if(signupBtn){

signupBtn.onclick =
()=>widget.open("signup");

}



if(logoutBtn){

logoutBtn.onclick =
()=>widget.logout();

}




/*
NETLIFY EVENTS
*/


widget.on(
"init",
user=>{

updateUI(user);

}

);



widget.on(
"login",
user=>{


updateUI(user);


document.dispatchEvent(

new CustomEvent(
"tokyra:login",
{
detail:{user}
}

)

);


widget.close();


}

);



widget.on(
"logout",
()=>{


updateUI(null);


document.dispatchEvent(

new CustomEvent(
"tokyra:logout"

)

);


}

);



widget.on(
"error",
error=>{

console.error(
"Tokyra Identity Error:",
error
);

}

);




widget.init();


}




if(
document.readyState === "loading"
){

document.addEventListener(
"DOMContentLoaded",
setup
);

}

else{

setup();

}



})();
