/* Olio Theme Scripts */

(function ($) {
    "use strict";

    $(window).on('load', function () {
        $('body').addClass('loaded');
    });

    /*=========================================================================
        Sticky Header
    =========================================================================*/
    $(function () {
        var header = $("#header"),
            yOffset = 0,
            triggerPoint = 80;
        $(window).on('scroll', function () {
            yOffset = $(window).scrollTop();

            if (yOffset >= triggerPoint) {
                header.addClass("navbar-fixed-top");
            } else {
                header.removeClass("navbar-fixed-top");
            }
        });
    });

    /*=========================================================================
            Mobile Menu
    =========================================================================*/
    $('.menu-wrap ul.nav').slicknav({
        prependTo: '.header-section .navbar',
        label: '',
        allowParentLinks: true
    });


    /*=========================================================================
        Initialize smoothscroll plugin
    =========================================================================*/
    smoothScroll.init({
        offset: 60
    });

    /*=========================================================================
        Scroll To Top
    =========================================================================*/
    $(window).on('scroll', function () {
        if ($(this).scrollTop() > 100) {
            $('#scroll-to-top').fadeIn();
        } else {
            $('#scroll-to-top').fadeOut();
        }
    });

    /*=========================================================================
        WOW Active
    =========================================================================*/
    new WOW().init();


})(jQuery);
