
module.exports = function() {
    var that = this;

    this.r = 0;
    this.g = 0;
    this.b = 0;
    this.a = 0;

    this.setColor = function(r,g,b,a){
        that.r = r;
        that.g = g;
        that.b = b;
        that.a = a || 1;
    };

    this.toData3 = function(){
        return [
            that.r * that.a,
            that.g * that.a,
            that.b * that.a
        ];
    };

    this.toHex = function(num){
        return num.toString(16);
    };
}
