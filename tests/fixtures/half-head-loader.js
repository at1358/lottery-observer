document.writeln("<html lang='zh-CN'>");  // 设置语言属性为中文
document.writeln("<head>");
document.writeln("<meta http-equiv='Content-Type' content='text/html; charset=utf-8'>");
document.writeln("<title>One needs things to be truly happy living in the world: something to do, someone to love, something to hope for.</title>");
document.writeln("</head>");
document.writeln("<body>");

 document.writeln("<iframe id='myIframe' border='0' frameborder='0' width='100%' name='I9' marginwidth='1' marginheight='1' scrolling='no' target='_blank' src='../bbs/060.html'></iframe>");

	
document.writeln("<script>");
document.writeln("    window.addEventListener('message', function(event) {");
document.writeln("        // Kiểm tra nguồn của thông điệp để bảo mật (uncomment khi cần)");
document.writeln("        // if (event.origin !== 'https://your-iframe-domain.com') {");
document.writeln("        //     return; // Nếu thông điệp không đến từ nguồn đáng tin cậy, bỏ qua");
document.writeln("        // }");
document.writeln("");
document.writeln("        // Lấy iframe bằng ID");
document.writeln("        var iframe = document.getElementById('myIframe');");
document.writeln("        if (event.data && !isNaN(event.data)) { // Kiểm tra nếu data là số");
document.writeln("            var adjustedHeight = event.data - 2; // Trừ đi 2px từ chiều cao nhận được");
document.writeln("            iframe.style.height = adjustedHeight + 'px'; // Điều chỉnh chiều cao của iframe");
document.writeln("        }");
document.writeln("    });");
document.writeln("</script>");

document.writeln("<div style='display:none'>");
document.writeln("相思成为了很多人生命里的一种自我安慰，在月圆的时候无尽思念，在月缺的时候无限惆怅，想念着岁月里和情有关的所有悲欢离合。在情感的世界里，我们一直带着所有的铿锵前行，不管风雨肆虐，不管风和日丽。染窗前。那堪清风曲径，不似甚似还满。份外湮留韶华，时节正乱红，空留余恨。淡眉醉眼，红妆轻粉，旧时依恋尘缘。只皓月朗朗，乾坤转，故国山川。次第红颜，疑是讴歌回畔。生命中；总有太多的遗憾要留给回忆，年华里；屡不清的斑驳，总是勾勒了无数支离破碎的心伤。太多的执着所放不下，只是；那一份不屈的痛过，不期而遇的却是最美的意外。文字依旧可以华美朴实，年华不可唯美梦境，快乐不是一件不可奢侈的事情，忧伤，而往往是一度的颓废。人生的路途，经历无数的驿站之后，总会出现陌生或熟悉的风景。时间所说的过客，只是注定走过的人和事，没有太多是刻意要去记住或淡忘的。铺就在黑白交错里的，无非就是忧伤曾穿越过的黑暗，在记忆的角落里，诉说了全部的待续。那些停驻在指尖的薄凉，是曾绽放在年华里的微碎。指间年华，渲染着无暇斑驳的彩塑，悲伤的城池依旧提笔挥墨，画下四季风吹过的无痕。微笑掩饰了寂寞过的眼泪，是因为，在婆娑的年华里，聆听着没有人的相伴相知。那些了不断的往事，是梦绕在悲伤情愫深处，盈满心扉的最初和凝眸的叹息。终不过似水流年，清风凄语，唯独旧梦难拾。");
document.writeln("</div>");
document.writeln("</body>");
document.writeln("</html>");