const h=document.querySelector('header');const on=()=>h.classList.toggle('solid',scrollY>30);on();addEventListener('scroll',on,{passive:true});
